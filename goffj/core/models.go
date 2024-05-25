package core

import (
	"time"
)

type Realm struct {
	ID           string `json:"id"`           // unique identifier
	Name         string `json:"name"`         // public name one word only, ties to ID
	Active       bool   `json:"active"`       // is this active
	Type         string `json:"type"`         // type: AD, AZURE, AWS, LDAP, UserShared
	Owner        string `json:"owner"`        // Owner user name
	Tenant       string `json:"tenant"`       // tenant name multiple words info only
	AuthProvider string `json:"authprovider"` // e.g.Auth0, FireBase, KeyCloak
}

type App struct {
	ID     string   `json:"app"`    // unique identifier
	Name   string   `json:"name"`   // name
	Active bool     `json:"active"` // active
	Realms []string `json:"realms"` // list of realms this belongs to
}

type User struct {
	ID         string   `json:"id"`         // unique identifier
	Username   string   `json:"username"`   // unique identifier
	Email      string   `json:"email"`      // this is a must field
	Name       string   `json:"name"`       // names can be elaborate
	Role       string   `json:"role"`       // Could be Admin, Contributor or Read-Only
	CreatedAt  string   `json:"createdat"`  // the date the user created vseg account
	LastAccess string   `json:"lastaccess"` // Last login access to vseg for the user
	Realms     []string `json:"realms"`     // the realms for this user realm IDs
}

type Task struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Text      string    `json:"text"`
	Completed bool      `json:"completed"`
	UID       string    `json:"uid"`
	Due       time.Time `json:"due"`
}

type Message struct {
	Keyname string `json:"keyname"`
	Content string `json:"content"`
}

type Clock interface {
	Now() time.Time
}

type realClock struct{}

func (realClock) Now() time.Time {
	return time.Now()
}

func NewClock() Clock {
	return &realClock{}
}
