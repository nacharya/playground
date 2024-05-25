package router

import (
	"goffj/core"
	"net/http"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

func XGetUser(c *gin.Context) {
	userid := c.Param("id")
	log.Println("ID: ", userid)
	cuser := core.User{}
	cuser.Name = "Foo"
	cuser.ID = userid
	c.JSON(http.StatusOK, cuser)
}

func XGetTenant(c *gin.Context) {
	tenantid := c.Param("id")
	log.Println("ID: ", tenantid)
	ctenant := core.Realm{}
	ctenant.Name = "Bar"
	ctenant.ID = tenantid
	c.JSON(http.StatusOK, ctenant)
}
