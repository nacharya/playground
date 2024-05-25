package router

import (
	"net/http"
	"goffj/core"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

func BaseServer_Handlers(mr *gin.Engine) {
	mr.GET("/healthcheck", func(c *gin.Context) {
		c.JSON(
			http.StatusOK,
			gin.H{
				"status": "ok",
			},
		)
	})

	mr.GET("/ready", func(c *gin.Context) {
		c.JSON(
			http.StatusOK,
			gin.H{
				"status": "ok",
			},
		)
	})

	mr.GET("/live", func(c *gin.Context) {
		c.JSON(
			http.StatusOK,
			gin.H{
				"status": "ok",
			},
		)
	})

}

func APIServer_Handlers(mr *gin.Engine) {
	userapi := mr.Group("/api/v1/user")
	userapi.GET("/:name", GetUser)
	userapi.PUT("/:name", UpdateUser)
	userapi.POST("/:name", AddUser)
	userapi.DELETE("/:name", DeleteUser)

	appapi := mr.Group("/api/v1/app")
	appapi.GET("/:name", GetApp)
	appapi.POST("/:name", AddApp)
	appapi.PUT("/:name", UpdateApp)
	appapi.DELETE("/:name", DeleteApp)

	tenantapi := mr.Group("/api/v1/realm")

	tenantapi.GET("/", GetRealmList)
	tenantapi.GET("/:name", GetRealm)
	tenantapi.GET("/:name/users", GetRealmUsers)
	tenantapi.GET("/:name/apps", GetRealmApps)
	tenantapi.POST(":name", AddRealm)
	tenantapi.PUT("/:name", UpdateRealm)
	tenantapi.DELETE("/:name", DeleteRealm)
	tenantapi.POST("/user/:name", AddUserToRealm)
	tenantapi.DELETE("/user/:name", DeleteUserFromRealm)
	tenantapi.POST("/app/:name", AddAppToRealm)
	tenantapi.DELETE("/app/:name", DeleteAppFromRealm)

	taskapi := mr.Group("/api/v1/task")
	taskapi.GET("/:id", GetTask)
	taskapi.PUT("/:id", UpdateTask)
	taskapi.DELETE("/:id", DeleteTask)
	taskapi.POST("/:id", AddTask)

}

func ServerRouter(mr *gin.Engine, Cfg core.Config) {
	mr.Use(gin.Recovery())
	BaseServer_Handlers(mr)
	APIServer_Handlers(mr)
	log.Println("Listening on ", Cfg.Port)
	mr.Run(Cfg.Port)
}
