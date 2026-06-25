package chat

import (
	"sync"
	"time"
)

type Message struct {
	ID        int    `json:"id"`
	IP        string `json:"ip"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

type Store struct {
	mu       sync.RWMutex
	messages []Message
	limit    int
}

func NewStore(limit int) *Store {
	if limit <= 0 {
		limit = 1000
	}
	return &Store{limit: limit}
}

func (s *Store) ListMessages() []Message {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Message, len(s.messages))
	copy(result, s.messages)
	return result
}

func (s *Store) AddMessage(msg Message) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	msg.ID = len(s.messages) + 1
	msg.Timestamp = time.Now().Format("2006-01-02T15:04:05.000000")
	s.messages = append(s.messages, msg)
	if len(s.messages) > s.limit {
		s.messages = s.messages[1:]
	}
	return msg
}

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

func (s *Service) ListMessages() []Message {
	return s.store.ListMessages()
}

func (s *Service) SendMessage(ip string, text string) Message {
	msg := Message{
		IP:      ip,
		Message: text,
	}
	return s.store.AddMessage(msg)
}
