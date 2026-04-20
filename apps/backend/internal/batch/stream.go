package batch

import (
	"sync"
	"sync/atomic"
	"time"
)

const streamSubscriberBuffer = 32

const (
	EventTypePaymentUpdated = "payment_updated"
	EventTypeBatchDone      = "batch_done"
)

type StreamEvent struct {
	Type              string    `json:"type"`
	BatchID           string    `json:"batch_id"`
	PaymentID         string    `json:"payment_id,omitempty"`
	Status            string    `json:"status,omitempty"`
	ErrorMessage      *string   `json:"error_message,omitempty"`
	TotalPayments     int       `json:"total_payments,omitempty"`
	CompletedPayments int       `json:"completed_payments,omitempty"`
	SentAt            time.Time `json:"sent_at"`
}

type Subscription struct {
	events      <-chan StreamEvent
	unsubscribe func()
	closeOnce   sync.Once
}

func (s *Subscription) Events() <-chan StreamEvent {
	return s.events
}

func (s *Subscription) Close() {
	if s == nil {
		return
	}

	s.closeOnce.Do(func() {
		if s.unsubscribe != nil {
			s.unsubscribe()
		}
	})
}

type StreamSource interface {
	Subscribe(batchID string) *Subscription
}

type StreamBroker struct {
	mu          sync.RWMutex
	nextID      atomic.Uint64
	subscribers map[string]map[uint64]chan StreamEvent
}

func NewStreamBroker() *StreamBroker {
	return &StreamBroker{
		subscribers: make(map[string]map[uint64]chan StreamEvent),
	}
}

func (b *StreamBroker) Subscribe(batchID string) *Subscription {
	ch := make(chan StreamEvent, streamSubscriberBuffer)
	subscriptionID := b.nextID.Add(1)

	b.mu.Lock()
	if b.subscribers[batchID] == nil {
		b.subscribers[batchID] = make(map[uint64]chan StreamEvent)
	}
	b.subscribers[batchID][subscriptionID] = ch
	b.mu.Unlock()

	return &Subscription{
		events: ch,
		unsubscribe: func() {
			b.removeSubscriber(batchID, subscriptionID)
		},
	}
}

func (b *StreamBroker) PublishPaymentStatus(batchID, paymentID, status string, errorMessage *string) {
	b.publish(batchID, StreamEvent{
		Type:         EventTypePaymentUpdated,
		BatchID:      batchID,
		PaymentID:    paymentID,
		Status:       status,
		ErrorMessage: cloneStringPointer(errorMessage),
		SentAt:       time.Now().UTC(),
	})
}

func (b *StreamBroker) PublishBatchDone(batchID string, totalPayments, completedPayments int) {
	b.publish(batchID, NewBatchDoneEvent(batchID, totalPayments, completedPayments))
	b.closeBatch(batchID)
}

func NewBatchDoneEvent(batchID string, totalPayments, completedPayments int) StreamEvent {
	return StreamEvent{
		Type:              EventTypeBatchDone,
		BatchID:           batchID,
		TotalPayments:     totalPayments,
		CompletedPayments: completedPayments,
		SentAt:            time.Now().UTC(),
	}
}

func NewSingleEventSubscription(event StreamEvent) *Subscription {
	ch := make(chan StreamEvent, 1)
	ch <- event
	close(ch)

	return &Subscription{events: ch}
}

func (b *StreamBroker) publish(batchID string, event StreamEvent) {
	type subscriber struct {
		id uint64
		ch chan StreamEvent
	}

	b.mu.RLock()
	batchSubscribers := b.subscribers[batchID]
	subscribers := make([]subscriber, 0, len(batchSubscribers))
	for id, ch := range batchSubscribers {
		subscribers = append(subscribers, subscriber{id: id, ch: ch})
	}
	b.mu.RUnlock()

	staleSubscribers := make([]uint64, 0)

	for _, subscriber := range subscribers {
		select {
		case subscriber.ch <- event:
		default:
			staleSubscribers = append(staleSubscribers, subscriber.id)
		}
	}

	for _, subscriptionID := range staleSubscribers {
		b.removeSubscriber(batchID, subscriptionID)
	}
}

func (b *StreamBroker) closeBatch(batchID string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	batchSubscribers := b.subscribers[batchID]
	delete(b.subscribers, batchID)

	for _, ch := range batchSubscribers {
		close(ch)
	}
}

func (b *StreamBroker) removeSubscriber(batchID string, subscriptionID uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	batchSubscribers := b.subscribers[batchID]
	if batchSubscribers == nil {
		return
	}

	ch, ok := batchSubscribers[subscriptionID]
	if !ok {
		return
	}

	delete(batchSubscribers, subscriptionID)
	if len(batchSubscribers) == 0 {
		delete(b.subscribers, batchID)
	}

	close(ch)
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}

	cloned := *value
	return &cloned
}
