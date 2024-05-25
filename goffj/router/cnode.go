package router

import (
	"bytes"
	"io/ioutil"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
)

func ReverseProxy(c *gin.Context) {
	log.Debug("/xadmin ReverseProxy Request for: ", c.Request.URL)
	log.Debug("Param: ", c.Param("proxyPath"))
	remote, err := url.Parse("http://kvd:4200/xadmin")
	// for test only. to be removed
	// remote, err := url.Parse("http://www.google.com")
	if err != nil {
		panic(err)
	}

	var bodyBytes []byte
	if c.Request.Body != nil {
		bodyBytes, _ = ioutil.ReadAll(c.Request.Body)
	}
	newBody := string(bodyBytes)
	c.Request.Body = ioutil.NopCloser(bytes.NewBuffer([]byte(newBody)))

	proxy := httputil.NewSingleHostReverseProxy(remote)
	proxy.Director = func(req *http.Request) {

		req.Header.Set("Content-Length", strconv.Itoa(len(newBody)))
		req.ContentLength = int64(len(newBody))

		req.Header = c.Request.Header.Clone()
		req.Host = remote.Host
		req.URL.Scheme = remote.Scheme
		req.URL.Host = remote.Host
		// req.URL.Path = c.Param("proxyPath")
		req.URL.Path = remote.Path
	}
	proxy.ServeHTTP(c.Writer, c.Request)
}

type routes struct {
	router *gin.Engine
}
