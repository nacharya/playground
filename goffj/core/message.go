package core

import (
	log "github.com/sirupsen/logrus"
)

func ProcessMessage(msg Message) {
	log.Debug("Processing ", msg.Keyname)

}
