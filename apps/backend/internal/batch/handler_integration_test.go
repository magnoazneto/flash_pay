package batch

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/flashpay/backend/internal/domain"
	"github.com/flashpay/backend/internal/gateway"
	"github.com/flashpay/backend/internal/payment"
	"github.com/flashpay/backend/internal/worker"
	"github.com/flashpay/backend/pkg/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

const batchIntegrationJWTSecret = "IntegrationSecret-FlashPay-0123456789!"

type memoryBatchRepository struct {
	mu      sync.Mutex
	records map[string]BatchRecord
	nextID  int
}

func newMemoryBatchRepository() *memoryBatchRepository {
	return &memoryBatchRepository{
		records: make(map[string]BatchRecord),
	}
}

func (r *memoryBatchRepository) CreateBatch(_ context.Context, userID, fileName string, totalPayments int) (string, time.Time, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.nextID++
	id := "batch-" + strconv.Itoa(r.nextID)
	createdAt := time.Now().UTC()
	r.records[id] = BatchRecord{
		ID:            id,
		UserID:        userID,
		FileName:      fileName,
		TotalPayments: totalPayments,
		Status:        "pending",
		CreatedAt:     createdAt,
	}

	return id, createdAt, nil
}

func (r *memoryBatchRepository) FindByUserID(_ context.Context, userID string, limit, offset int) ([]BatchRecord, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	filtered := make([]BatchRecord, 0)
	for _, record := range r.records {
		if record.UserID == userID {
			filtered = append(filtered, record)
		}
	}

	return paginateBatchRecords(filtered, limit, offset), len(filtered), nil
}

func (r *memoryBatchRepository) FindByID(_ context.Context, id string) (BatchRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	record, ok := r.records[id]
	if !ok {
		return BatchRecord{}, domain.ErrNotFound
	}

	return record, nil
}

func (r *memoryBatchRepository) FindAll(_ context.Context, filterUserID, filterStatus string, limit, offset int) ([]BatchRecord, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	filtered := make([]BatchRecord, 0)
	for _, record := range r.records {
		if filterUserID != "" && record.UserID != filterUserID {
			continue
		}
		if filterStatus != "" && record.Status != filterStatus {
			continue
		}
		filtered = append(filtered, record)
	}

	return paginateBatchRecords(filtered, limit, offset), len(filtered), nil
}

func (r *memoryBatchRepository) updateStatus(batchID, status string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	record := r.records[batchID]
	record.Status = status
	r.records[batchID] = record
}

func paginateBatchRecords(records []BatchRecord, limit, offset int) []BatchRecord {
	sort.Slice(records, func(i, j int) bool {
		return records[i].CreatedAt.After(records[j].CreatedAt)
	})

	if offset >= len(records) {
		return []BatchRecord{}
	}

	end := offset + limit
	if end > len(records) {
		end = len(records)
	}

	return records[offset:end]
}

type memoryPaymentRepository struct {
	mu        sync.Mutex
	byID      map[string]payment.Payment
	byBatchID map[string][]string
	batches   *memoryBatchRepository
}

func newMemoryPaymentRepository(batches *memoryBatchRepository) *memoryPaymentRepository {
	return &memoryPaymentRepository{
		byID:      make(map[string]payment.Payment),
		byBatchID: make(map[string][]string),
		batches:   batches,
	}
}

func (r *memoryPaymentRepository) UpdateStatus(_ context.Context, paymentID, status string, errorMessage *string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	record := r.byID[paymentID]
	record.Status = status
	if errorMessage != nil {
		message := *errorMessage
		record.ErrorMessage = &message
	} else {
		record.ErrorMessage = nil
	}
	r.byID[paymentID] = record
	r.batches.updateStatus(record.BatchID, r.batchStatus(record.BatchID))

	return nil
}

func (r *memoryPaymentRepository) SetProcessedAt(_ context.Context, paymentID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	record := r.byID[paymentID]
	now := time.Now().UTC()
	record.ProcessedAt = &now
	r.byID[paymentID] = record
	return nil
}

func (r *memoryPaymentRepository) FindByBatchID(_ context.Context, batchID string) ([]payment.Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ids := r.byBatchID[batchID]
	items := make([]payment.Payment, 0, len(ids))
	for _, id := range ids {
		items = append(items, r.byID[id])
	}

	return items, nil
}

func (r *memoryPaymentRepository) CountByStatus(_ context.Context, batchID string) (payment.StatusCount, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.countByStatusLocked(batchID), nil
}

func (r *memoryPaymentRepository) CreatePayments(_ context.Context, payments []payment.Payment) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, item := range payments {
		r.byID[item.ID] = item
		r.byBatchID[item.BatchID] = append(r.byBatchID[item.BatchID], item.ID)
	}

	return nil
}

func (r *memoryPaymentRepository) countByStatusLocked(batchID string) payment.StatusCount {
	counts := payment.StatusCount{}

	for _, id := range r.byBatchID[batchID] {
		switch r.byID[id].Status {
		case "pending":
			counts.Pending++
		case "processing":
			counts.Processing++
		case "success":
			counts.Success++
		case "failed":
			counts.Failed++
		}
	}

	return counts
}

func (r *memoryPaymentRepository) batchStatus(batchID string) string {
	counts := r.countByStatusLocked(batchID)

	switch {
	case counts.Processing > 0:
		return "processing"
	case counts.Pending > 0:
		return "pending"
	case counts.Failed > 0:
		return "failed"
	default:
		return "success"
	}
}

type alternatingGateway struct {
	count atomic.Int32
}

func (g *alternatingGateway) ProcessPayment(_ context.Context, paymentID string) gateway.GatewayResult {
	_ = paymentID

	if g.count.Add(1)%2 == 0 {
		return gateway.GatewayResult{Success: false, ErrorMessage: "gateway error"}
	}

	return gateway.GatewayResult{Success: true}
}

func batchTestRouter() http.Handler {
	batchRepo := newMemoryBatchRepository()
	paymentRepo := newMemoryPaymentRepository(batchRepo)
	streams := NewStreamBroker()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := worker.NewPool(paymentRepo, &alternatingGateway{}, streams, logger, 1)
	handler := NewHandler(NewService(batchRepo, paymentRepo, pool, streams))

	middleware.SetJWTSecret(batchIntegrationJWTSecret)

	r := chi.NewRouter()
	r.Use(middleware.PrometheusMetrics)
	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.Auth)
		r.Post("/batches/upload", handler.Upload)
		r.Get("/batches/{id}", handler.GetByID)
		r.Get("/batches/{id}/stream", handler.Stream)
		r.Get("/batches", handler.List)
		r.With(middleware.RequireRole("admin")).Get("/admin/batches", handler.ListAll)
	})

	return r
}

func TestBatchHTTP_ProcessesUploadAndReturnsFinalStatuses(t *testing.T) {
	router := batchTestRouter()

	csvPayload := strings.Join([]string{
		"id,amount,recipient,description,payment_method,last_4_digits",
		"pay-1,10.00,Alice,Salary,pix,1234",
		"pay-2,20.00,Bob,Invoice,credit_card,5678",
	}, "\n")

	uploadRec := performMultipartUpload(t, router, "/api/batches/upload", "operator-1", "operator", "payments.csv", csvPayload)
	if uploadRec.Code != http.StatusAccepted {
		t.Fatalf("upload status = %d, want %d", uploadRec.Code, http.StatusAccepted)
	}

	var uploadResponse UploadResponse
	decodeBatchJSON(t, uploadRec, &uploadResponse)
	if uploadResponse.TotalPayments != 2 {
		t.Fatalf("total_payments = %d, want 2", uploadResponse.TotalPayments)
	}

	waitForBatchCompletion(t, router, uploadResponse.BatchID, "operator-1", "operator")

	detailRec := performAuthorizedRequest(t, router, http.MethodGet, "/api/batches/"+uploadResponse.BatchID, "operator-1", "operator", nil)
	if detailRec.Code != http.StatusOK {
		t.Fatalf("detail status = %d, want %d", detailRec.Code, http.StatusOK)
	}

	var detailResponse BatchDetailResponse
	decodeBatchJSON(t, detailRec, &detailResponse)
	if detailResponse.Status != "failed" {
		t.Fatalf("batch status = %s, want failed", detailResponse.Status)
	}
	if detailResponse.StatusCount.Success != 1 || detailResponse.StatusCount.Failed != 1 {
		t.Fatalf("unexpected status counts: %+v", detailResponse.StatusCount)
	}
}

func TestBatchHTTP_RejectsInvalidCSVAndProtectsAdminVisibility(t *testing.T) {
	router := batchTestRouter()

	invalidCSV := strings.Join([]string{
		"id,amount,recipient,payment_method,last_4_digits",
		"pay-1,-10,Alice,pix,1234",
	}, "\n")

	invalidRec := performMultipartUpload(t, router, "/api/batches/upload", "operator-1", "operator", "payments.csv", invalidCSV)
	if invalidRec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid upload status = %d, want %d", invalidRec.Code, http.StatusUnprocessableEntity)
	}

	validCSV := strings.Join([]string{
		"id,amount,recipient,description,payment_method,last_4_digits",
		"pay-3,15.00,Carol,Refund,pix,4321",
	}, "\n")

	ownerUploadRec := performMultipartUpload(t, router, "/api/batches/upload", "owner-1", "operator", "owner.csv", validCSV)
	if ownerUploadRec.Code != http.StatusAccepted {
		t.Fatalf("owner upload status = %d, want %d", ownerUploadRec.Code, http.StatusAccepted)
	}

	var ownerUploadResponse UploadResponse
	decodeBatchJSON(t, ownerUploadRec, &ownerUploadResponse)
	waitForBatchCompletion(t, router, ownerUploadResponse.BatchID, "owner-1", "operator")

	forbiddenRec := performAuthorizedRequest(t, router, http.MethodGet, "/api/batches/"+ownerUploadResponse.BatchID, "operator-2", "operator", nil)
	if forbiddenRec.Code != http.StatusForbidden {
		t.Fatalf("operator reading someone else's batch status = %d, want %d", forbiddenRec.Code, http.StatusForbidden)
	}

	adminListRec := performAuthorizedRequest(t, router, http.MethodGet, "/api/admin/batches?limit=10&offset=0", "admin-1", "admin", nil)
	if adminListRec.Code != http.StatusOK {
		t.Fatalf("admin list status = %d, want %d", adminListRec.Code, http.StatusOK)
	}

	var listResponse BatchListResponse
	decodeBatchJSON(t, adminListRec, &listResponse)
	if listResponse.Total == 0 {
		t.Fatal("expected admin list to include uploaded batches")
	}
	if listResponse.Batches[0].UserID == "" {
		t.Fatal("expected user_id in admin batch summary")
	}
}

func TestBatchHTTP_StreamReturnsBatchDoneEvent(t *testing.T) {
	router := batchTestRouter()

	csvPayload := strings.Join([]string{
		"id,amount,recipient,description,payment_method,last_4_digits",
		"pay-1,10.00,Alice,Salary,pix,1234",
	}, "\n")

	uploadRec := performMultipartUpload(t, router, "/api/batches/upload", "operator-1", "operator", "payments.csv", csvPayload)
	if uploadRec.Code != http.StatusAccepted {
		t.Fatalf("upload status = %d, want %d", uploadRec.Code, http.StatusAccepted)
	}

	var uploadResponse UploadResponse
	decodeBatchJSON(t, uploadRec, &uploadResponse)
	waitForBatchCompletion(t, router, uploadResponse.BatchID, "operator-1", "operator")

	streamRec := performAuthorizedRequest(t, router, http.MethodGet, "/api/batches/"+uploadResponse.BatchID+"/stream", "operator-1", "operator", nil)
	if streamRec.Code != http.StatusOK {
		t.Fatalf("stream status = %d, want %d, body=%s", streamRec.Code, http.StatusOK, streamRec.Body.String())
	}

	body := streamRec.Body.String()
	if !strings.Contains(body, "event: batch_done") {
		t.Fatalf("expected batch_done event in stream body, got %q", body)
	}
	if !strings.Contains(body, "\"batch_id\":\""+uploadResponse.BatchID+"\"") {
		t.Fatalf("expected batch_id in stream body, got %q", body)
	}
}

func performMultipartUpload(t *testing.T, handler http.Handler, path, userID, role, fileName, content string) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatalf("failed to create multipart file: %v", err)
	}
	if _, err := io.Copy(part, strings.NewReader(content)); err != nil {
		t.Fatalf("failed to write multipart content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+signBatchToken(t, userID, role))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func performAuthorizedRequest(t *testing.T, handler http.Handler, method, path, userID, role string, body io.Reader) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Authorization", "Bearer "+signBatchToken(t, userID, role))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func signBatchToken(t *testing.T, userID, role string) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"email":   userID + "@flashpay.test",
		"role":    role,
		"exp":     time.Now().Add(time.Hour).Unix(),
	})

	signed, err := token.SignedString([]byte(batchIntegrationJWTSecret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	return signed
}

func waitForBatchCompletion(t *testing.T, handler http.Handler, batchID, userID, role string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		rec := performAuthorizedRequest(t, handler, http.MethodGet, "/api/batches/"+batchID, userID, role, nil)
		if rec.Code == http.StatusOK {
			var detail BatchDetailResponse
			decodeBatchJSON(t, rec, &detail)
			if detail.StatusCount.Pending == 0 && detail.StatusCount.Processing == 0 {
				return
			}
		}

		time.Sleep(20 * time.Millisecond)
	}

	t.Fatalf("batch %s did not finish processing before timeout", batchID)
}

func decodeBatchJSON(t *testing.T, rec *httptest.ResponseRecorder, dest any) {
	t.Helper()

	if err := json.Unmarshal(rec.Body.Bytes(), dest); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
}
