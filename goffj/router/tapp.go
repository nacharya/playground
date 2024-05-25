package router

import (
	"net/http"
	"goffj/core"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

func GetApp(c *gin.Context) {
	a := c.Param("name")
	if len(a) > 0 {
		log.Debug("app: ", a)
	}
	appaccess := core.AppAccess{}
	app, err := appaccess.GetApp(core.UserDB, a)
	if err != nil {
		errStr := err.Error()
		c.JSON(http.StatusNotFound, gin.H{"error ": errStr})
	} else {
		c.IndentedJSON(http.StatusOK, app)
	}
}

func DeleteApp(c *gin.Context) {
	a := c.Param("name")
	if len(a) > 0 {
		log.Debug("app: ", a)
	}
	appaccess := core.AppAccess{}
	err := appaccess.RemoveApp(core.UserDB, a)
	if err != nil {
		errStr := "Unable to remove" + a + err.Error()
		c.JSON(http.StatusNotFound, gin.H{"error ": errStr})
	} else {
		c.IndentedJSON(http.StatusOK, a)
	}

}

func AddApp(c *gin.Context) {
	a := c.Param("name")
	if len(a) > 0 {
		log.Debug("app: ", a)
	}
	var app core.App
	if err := c.BindJSON(&app); err != nil {
		errStr := err.Error()
		c.JSON(http.StatusBadRequest, gin.H{"error": errStr})
		return
	}
	app.Name = a
	appaccess := core.AppAccess{}
	err := appaccess.UpdateApp(core.UserDB, app)
	if err != nil {
		errStr := err.Error()
		c.JSON(http.StatusNotFound, gin.H{"error ": errStr})
	} else {
		c.IndentedJSON(http.StatusCreated, app)
	}

}

func UpdateApp(c *gin.Context) {
	a := c.Param("name")
	log.Println("UpdateApp ", a)

	if len(a) > 0 {
		log.Debug("app: ", a)
	}
	var app core.App
	if err := c.BindJSON(&app); err != nil {
		errStr := err.Error()
		c.JSON(http.StatusBadRequest, gin.H{"error": errStr})
		return
	}
	appaccess := core.AppAccess{}
	err := appaccess.UpdateApp(core.UserDB, app)
	if err != nil {
		errStr := err.Error()
		c.JSON(http.StatusNotFound, gin.H{"error ": errStr})
	} else {
		c.IndentedJSON(http.StatusCreated, app)
	}
}
