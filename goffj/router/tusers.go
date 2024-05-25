package router

import (
	"net/http"
	"goffj/core"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

func GetUser(c *gin.Context) {
	u := c.Param("name")
	log.Println("GetUser ", u)
	ctx := c.Query("realm")
	if (len(u) > 0) && (len(ctx) > 0) {
		log.Debug("uid: ", u, " realm: ", ctx)
	}
	uaccess := core.UserAccess{}
	user, err := uaccess.GetUser(core.UserDB, u)
	if err != nil {
		errMsg := "User " + u + " not found"
		c.JSON(http.StatusNotFound, gin.H{"error ": errMsg})
	} else {
		c.IndentedJSON(http.StatusOK, user)
	}
}

func DeleteUser(c *gin.Context) {
	u := c.Param("name")
	log.Println("DeleteUser ", u)
	ctx := c.Query("realm")
	if (len(u) > 0) && (len(ctx) > 0) {
		log.Debug("uid: ", u, " realm: ", ctx)
	}
	uaccess := core.UserAccess{}
	err := uaccess.RemoveUser(core.UserDB, u)
	if err != nil {
		log.Error("Unable to remove "+u, err)
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to delete User"})
	} else {
		c.IndentedJSON(http.StatusOK, u)
	}
}

func UpdateUser(c *gin.Context) {
	u := c.Param("name")
	log.Println("UpdateUser ", u)
	ctx := c.Query("realm")
	if (len(u) > 0) && (len(ctx) > 0) {
		log.Debug("id: ", u, " realm: ", ctx)
	}
	var user core.User
	if err := c.BindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bad request"})
		return
	}
	uaccess := core.UserAccess{}
	err := uaccess.UpdateUser(core.UserDB, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "ID Not Found"})
	} else {
		c.IndentedJSON(http.StatusCreated, u)
	}

}

func AddUser(c *gin.Context) {
	u := c.Param("name")
	log.Println("AddUser ", u)
	ctx := c.Query("realm")
	if (len(u) > 0) && (len(ctx) > 0) {
		log.Debug("id: ", u, " realm: ", ctx)
	}
	var user core.User
	if err := c.BindJSON(&user); err != nil {
		log.Error(err)
		errStr := err.Error()
		c.JSON(http.StatusBadRequest, gin.H{"error": errStr})
		return
	}
	uaccess := core.UserAccess{}
	err := uaccess.AddUser(core.UserDB, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "ID Not Found"})
	} else {
		c.IndentedJSON(http.StatusCreated, u)
	}
}
