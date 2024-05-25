package core

import (
	"sync"

	"github.com/nats-io/nats.go"
	log "github.com/sirupsen/logrus"
)

type userMsg struct {
	Id         string `json:"id"`
	LastAccess string `json:"lastaccess"`
}

func NATSmsgHandler(msg []byte) error {
	log.Println(string(msg))
	return nil
}

func NATSinit() error {
	nc, err := nats.Connect("0.0.0.0:4444")
	defer nc.Close()
	if err != nil {
		log.Fatal(err)
		return err
	}
	log.Info("Connected to ", nc.ConnectedServerName())
	// Use a WaitGroup to wait for a message to arrive
	wg := sync.WaitGroup{}
	wg.Add(1)

	// Subscribe
	if _, err := nc.Subscribe("Users", func(m *nats.Msg) {
		NATSmsgHandler(m.Data)
		wg.Done()
		log.Info("Subscribed to Users ")
	}); err != nil {
		log.Fatal(err)
		return err
	}
	nc.Flush()
	// Wait for a message to come in
	wg.Wait()
	return nil
}
