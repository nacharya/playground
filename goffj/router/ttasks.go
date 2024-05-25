package router

import (
	"net/http"
	"goffj/core"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

func GetTask(c *gin.Context) {
	t := c.Param("id")
	uid := c.Query("uid")
	if (len(uid) > 0) && (len(t) > 0) {
		log.Debug("tid: ", t, " uid: ", uid)
	}
	log.Debug("ID: ", t)
	var taccess core.TaskAccess
	task, err := taccess.GetTask(core.TaskDB, t)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "User Not Found"})
	} else {
		c.IndentedJSON(http.StatusOK, task)
	}
}

func AddTask(c *gin.Context) {
	t := c.Param("id")
	u := c.Query("uid")
	if (len(t) > 0) && (len(u) > 0) {
		log.Debug("id: ", t, " uid: ", u)
	}
	var task core.Task
	if err := c.BindJSON(&task); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bad request"})
		return
	}
	log.Println("Task: ", task)
	var taccess core.TaskAccess
	err := taccess.AddTask(core.TaskDB, task)
	if err == nil {
		c.IndentedJSON(http.StatusCreated, task)
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to add task"})
	}
}

func UpdateTask(c *gin.Context) {
	t := c.Param("id")
	u := c.Query("uid")
	if (len(t) > 0) && (len(u) > 0) {
		log.Debug("id: ", t, " uid: ", u)
	}
	var task core.Task
	if err := c.BindJSON(&task); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bad request"})
		return
	}
	var taccess core.TaskAccess
	log.Println("Task: ", task)
	err := taccess.UpdateTask(core.TaskDB, task)
	if err == nil {
		c.IndentedJSON(http.StatusCreated, task)
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error ": "ID Not Found"})
	}
}

func DeleteTask(c *gin.Context) {
	t := c.Param("id")
	u := c.Query("uid")
	if (len(t) > 0) && (len(u) > 0) {
		log.Debug("task: ", t, " uid: ", u)
	}
	var taccess core.TaskAccess
	err := taccess.DeleteTask(core.TaskDB, t)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to delete User"})
	} else {
		c.IndentedJSON(http.StatusOK, t)
	}
}
