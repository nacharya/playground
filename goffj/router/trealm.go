package router

import (
	"net/http"
	"goffj/core"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

func GetRealm(c *gin.Context) {
	t := c.Param("name")

	if len(t) > 0 {
		log.Println("Get Realm ID: ", t)
	}
	var taccess core.RealmAccess
	Realm, err := taccess.GetRealm(core.RealmDB, t)
	if err == nil {
		// need this for browsers that complain about CSRF attacks
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.IndentedJSON(http.StatusOK, Realm)
	} else {
		errStr := t + " " + err.Error()
		c.JSON(http.StatusNotFound, gin.H{"error ": errStr})
	}
}

func GetRealmList(c *gin.Context) {

	log.Println("Get RealmList")
	var taccess core.RealmAccess
	RealmList, err := taccess.GetRealmList(core.RealmDB)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Realm list Not Found"})
	} else {
		c.IndentedJSON(http.StatusOK, RealmList)
	}
}

/* http://<host:port>/api/v1/realm/2313REALMID?DFASEWUSERID
 */

func AddRealm(c *gin.Context) {
	t := c.Param("name")

	if len(t) > 0 {
		log.Debug("name: ", t)
	}
	var Realm core.Realm
	if err := c.BindJSON(&Realm); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bad request"})
		return
	}
	var taccess core.RealmAccess
	log.Println("Realm: ", Realm)
	ID, err := taccess.AddRealm(core.RealmDB, Realm)
	Realm.ID = ID
	if err == nil {
		c.IndentedJSON(http.StatusCreated, Realm)
	} else {
		errStr := err.Error()
		c.JSON(http.StatusNotFound, gin.H{"error ": errStr})
	}
}

func UpdateRealm(c *gin.Context) {
	t := c.Param("name")
	if len(t) > 0 {
		log.Debug("name: ", t)
	}
	var Realm core.Realm
	if err := c.BindJSON(&Realm); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bad request"})
		return
	}
	var taccess core.RealmAccess
	log.Println("Update Realm: ", Realm)
	err := taccess.UpdateRealm(core.RealmDB, Realm)
	if err != nil {
		errStr := err.Error()
		c.JSON(http.StatusNotFound, gin.H{"error ": errStr})
	}
	c.IndentedJSON(http.StatusCreated, Realm)
}

func DeleteRealm(c *gin.Context) {
	t := c.Param("name")
	if len(t) > 0 {
		log.Debug("Realm: ", t)
	}
	var taccess core.RealmAccess
	log.Println("Deleting Realm: ", t)
	err := taccess.DeleteRealm(core.RealmDB, t)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to delete User"})
	} else {
		c.IndentedJSON(http.StatusOK, t)
	}
}

func GetRealmApps(c *gin.Context) {
	t := c.Param("name")
	if len(t) > 0 {
		log.Debug("Realm: ", t)
	}
	var taccess core.RealmAccess
	AppList, err := taccess.GetRealmApps(core.Appdb, t)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to get App list"})
	} else {
		c.IndentedJSON(http.StatusOK, AppList)
	}
}

func GetRealmUsers(c *gin.Context) {
	t := c.Param("name")
	if len(t) > 0 {
		log.Debug("Realm: ", t)
	}
	var taccess core.RealmAccess
	UserList, err := taccess.GetRealmUsers(core.Userdb, t)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to get App list"})
	} else {
		c.IndentedJSON(http.StatusOK, UserList)
	}
}

func AddUserToRealm(c *gin.Context) {
	t := c.Param("name")
	u := c.Query("user")
	if (len(t) > 0) && (len(u) > 0) {
		log.Debug("Realm: ", t, " user: ", u)
	}
	var taccess core.RealmAccess
	err := taccess.AddUserToRealm(core.UserDB, u, t)
	if err == nil {
		c.IndentedJSON(http.StatusCreated, u)
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to add User to Realm"})
	}
}

func DeleteUserFromRealm(c *gin.Context) {
	t := c.Param("name")
	u := c.Query("user")
	if (len(t) > 0) && (len(u) > 0) {
		log.Debug("Realm: ", t, " user: ", u)
	}
	var taccess core.RealmAccess
	err := taccess.DeleteUserFromRealm(core.UserDB, u, t)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to delete User from Realm"})
	} else {
		c.IndentedJSON(http.StatusOK, u)
	}
}

func AddAppToRealm(c *gin.Context) {
	t := c.Param("name")
	a := c.Query("app")
	if (len(t) > 0) && (len(a) > 0) {
		log.Debug("Realm: ", t, " app: ", a)
	}
	var taccess core.RealmAccess
	err := taccess.AddAppToRealm(core.UserDB, a, t)
	if err == nil {
		c.IndentedJSON(http.StatusCreated, a)
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to add App to Realm"})
	}
}

func DeleteAppFromRealm(c *gin.Context) {
	t := c.Param("name")
	a := c.Query("app")
	if (len(t) > 0) && (len(a) > 0) {
		log.Debug("Realm: ", t, " app: ", a)
	}
	var taccess core.RealmAccess
	err := taccess.DeleteAppFromRealm(core.UserDB, t, a)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error ": "Unable to delete App from Realm"})
	} else {
		c.IndentedJSON(http.StatusOK, a)
	}
}
