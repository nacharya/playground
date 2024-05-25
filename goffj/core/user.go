package core

import (
	"crypto/sha256"
	"fmt"
	"os"

	"encoding/base64"
	"encoding/json"
	"errors"

	"github.com/boltdb/bolt"
	log "github.com/sirupsen/logrus"
)

type UserAccess struct{}
type AppAccess struct{}

var Userdb *bolt.DB
var Appdb *bolt.DB

// Create a ID based on a string if the ID is not available
func (c UserAccess) GetUserID(username string) []byte {

	h := sha256.New()
	h.Write([]byte(username))
	hash := base64.URLEncoding.EncodeToString(h.Sum(nil))
	userid := string(hash[:])
	return []byte(userid)

}

func (c UserAccess) GetUsers(db *bolt.DB) []User {

	bucket := "Users"
	numr := 0
	_ = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		Stats := b.Stats()
		numr = Stats.KeyN
		return nil
	})

	var users = make([]User, numr)

	index := 0
	_ = db.View(func(tx *bolt.Tx) error {
		// Assume bucket exists and has keys
		b := tx.Bucket([]byte(bucket))
		b.ForEach(func(k, v []byte) error {
			var user User
			json.Unmarshal(v, &user)
			users[index] = user
			index++
			return nil
		})
		return nil
	})

	return users
}

func (c UserAccess) GetUser(db *bolt.DB, Username string) (User, error) {

	var user User
	var err error

	ID := c.GetUserID(Username)
	key := string(ID)
	log.Println("Looking for <", key, ">")
	bucket := "Users"
	_ = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		v := b.Get([]byte(key))
		if v == nil {
			log.Error("<", key, "> Not Found\n", key)
			err = errors.New(Username + " not found")
			return err
		}
		if len(v) > 0 {
			json.Unmarshal(v, &user)
		}
		return err
	})
	log.Println("User: ", user)
	return user, err
}

func (c UserAccess) AddUser(db *bolt.DB, User User) error {

	bucket := "Users"
	ID := c.GetUserID(User.Username)
	key := string(ID)
	User.ID = key
	val, _ := json.Marshal(User)
	var err error
	_ = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		err = b.Put([]byte(key), val)
		return err
	})
	return err
}

func (c UserAccess) UpdateUser(db *bolt.DB, User User) error {

	bucket := "Users"

	ID := c.GetUserID(User.Username)
	key := string(ID)
	User.ID = key
	log.Info("Updating uid: " + key)
	// User.ID = string(key)
	val, _ := json.Marshal(User)
	var err error
	_ = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		err = b.Put([]byte(key), val)
		return err
	})

	return err
}

func (c UserAccess) RemoveUser(db *bolt.DB, Username string) error {

	ID := c.GetUserID(Username)
	key := string(ID)
	bucket := "Users"
	var err error
	_ = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		err = b.Delete([]byte(key))
		return err
	})
	return err
}

func (a AppAccess) GetAppID(name string) []byte {
	h := sha256.New()
	h.Write([]byte(name))
	hash := base64.URLEncoding.EncodeToString(h.Sum(nil))
	appid := string(hash[:])
	return []byte(appid)
}

func (a AppAccess) GetApp(db *bolt.DB, name string) (App, error) {

	var app App
	var err error

	ID := a.GetAppID(name)
	key := string(ID)
	log.Println("Looking for <", key, ">")
	bucket := "Apps"
	_ = db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		v := b.Get([]byte(key))
		if v == nil {
			log.Error("<", key, "> Not Found\n", key)
			err = errors.New(name + " not found")
			return err
		}
		if len(v) > 0 {
			json.Unmarshal(v, &app)
		}
		return err
	})
	log.Println("App: ", app)
	return app, err
}

func (a AppAccess) RemoveApp(db *bolt.DB, Name string) error {
	ID := a.GetAppID(Name)
	key := string(ID)
	bucket := "Apps"
	var err error
	_ = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		err = b.Delete([]byte(key))
		return err
	})
	return err
}

func (a AppAccess) UpdateApp(db *bolt.DB, app App) error {
	bucket := "Apps"
	ID := a.GetAppID(app.Name)
	key := string(ID)
	app.ID = key

	log.Info("Updating app" + app.Name + " id: " + key)
	val, _ := json.Marshal(app)
	var err error
	_ = db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucket))
		err = b.Put([]byte(key), val)
		return err
	})

	return err
}

func UserDbxInit(Cfg Config) (*bolt.DB, error) {

	dbpath := Cfg.Datavol + "/" + "users.db"
	var bdb *bolt.DB

	if _, err := os.Stat(dbpath); os.IsNotExist(err) {
		bdb, err = OpenBolt(dbpath)
		if err != nil {
			log.Error(err)
			return nil, err
		}
		bucket := "Users"
		Bucket_create(bdb, bucket)
		bucket = "Notes"
		Bucket_create(bdb, bucket)

	} else {
		bdb, err = OpenBolt(dbpath)
		if err != nil {
			log.Error(err)
			return nil, err
		}
	}
	log.Println("returning")
	return bdb, nil
}

func OpenBolt(dbname string) (*bolt.DB, error) {
	log.Println("Opendb ", dbname)
	db, err := bolt.Open(dbname, 0600, nil)
	if err != nil {
		log.Fatalln("Error: ", dbname, " ", err)
		return db, err
	}
	log.Println("Opened .... ")
	return db, nil
}

func CloseBolt(bdb *bolt.DB) {
	defer bdb.Close()
}

func Bucket_create(db *bolt.DB, bucket string) {
	_ = db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists([]byte(bucket))
		if err != nil {
			return fmt.Errorf("create bucket: %s", err)
		}
		return nil
	})
}

func Bucket_delete(db *bolt.DB, bucket string) {
	_ = db.Update(func(tx *bolt.Tx) error {
		err := tx.DeleteBucket([]byte(bucket))
		if err != nil {
			return fmt.Errorf("delete bucket: %s", err)
		}
		return nil
	})
}

func Bucket_show(db *bolt.DB, bucket string) {
	_ = db.View(func(tx *bolt.Tx) error {
		// Assume bucket exists and has keys
		b := tx.Bucket([]byte(bucket))

		b.ForEach(func(k, v []byte) error {
			fmt.Printf("key=%s, value=%s\n", k, v)
			return nil
		})
		return nil
	})
}

func Bucket_list(db *bolt.DB, bucket string) {
	_ = db.View(func(tx *bolt.Tx) error {
		// Assume bucket exists and has keys
		b := tx.Bucket([]byte(bucket))

		b.ForEach(func(k, v []byte) error {
			fmt.Println(string(v))
			return nil
		})
		return nil
	})
}
