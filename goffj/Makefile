
GO=go
#GODEF 


TARGET := goffj

SRCS := main.go $(wildcard *.go)

all: $(TARGET)


.PHONY: all clean

.get:
	touch $@

$(TARGET): $(SRCS) .get
ifeq ($(OS), Windows_NT)
	GOOS=windows GOARCH=amd64 go build -o $(TARGET) main.go
else 
	GOOS=$(shell uname -s | tr '[:upper:]' '[:lower:]') GOARCH=amd64 go build -o $(TARGET) main.go
endif

install:
	cp -a $(TARGET) $(GODEF)/bin
	go install
	echo "Install"

fmt:
	gofmt -e -s -w .


uninstall:
	rm -f $(GODEF)/bin/$(TARGET)

# list all the modules and dependencies
depmod:
	$(GO) list -m all

test:
	$(GO) test

clean: 
	rm -rf $(TARGET) .get *.log
