package core

import (
	"time"

	"github.com/gin-gonic/gin"
)

type Mroutes struct {
	Router *gin.Engine
}

var Mr Mroutes

/*
these are taken by the aws sdk from

	~/.aws/config or ~/.aws/credentials
	We do keep track here
*/
type Awsconfig struct {
	AccessKey string `json:"accesskey"`
	SecretKey string `json:"secretkey"`
}

type Azureconfig struct {
	TenantId       string `json:"tenantid"`
	ClientId       string `json:"clientid"`
	ClientSecret   string `json:"clientsecret"`
	SubscriptionId string `json:"subscriptionid"`
	ResourceGroup  string `json:"resourcegroup"`
	Location       string `json:"location"`
	StorageAccount string `json:"storageaccount"`
}

type Config struct {
	Name     string      `json:"name"`
	Port     string      `json:"port"`
	Datavol  string      `json:"datavol"`
	UserDB   string      `json:"userdb"`
	RealmDB  string      `json:"realmdb"`
	AppDB    string      `json:"appdb"`
	TaskDB   string      `json:"taskdb"`
	Loglevel string      `json:"loglevel"`
	Aws      Awsconfig   `json:"aws"`
	azure    Azureconfig `json:"azure"`
}

type Event struct {
	Update time.Time `json:"update"`
}
