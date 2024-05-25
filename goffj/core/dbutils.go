package core

import (
	"fmt"
	//"gorm.io/driver/sqlite"
	b64 "encoding/base64"
	"errors"
	"time"

	"github.com/boltdb/bolt"
	"github.com/glebarez/sqlite"
	log "github.com/sirupsen/logrus"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type KvDb struct {
}

var UserDB *bolt.DB
var UserDBAccess KvDb

var NotesDB *bolt.DB
var NotesDBAccess KvDb

type SqlDb struct {
}

var RealmDB *gorm.DB
var RealmDBAccess SqlDb
var TaskDB *gorm.DB
var TaskDBAccess SqlDb

func (sdb SqlDb) OpenInit(path string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Error("Failed to Open the database: ", path)
		return nil, err
	}

	Formatter := new(log.TextFormatter)
	log.SetFormatter(Formatter)
	Formatter.FullTimestamp = true
	log.Println("Opened ", path)

	return db, nil
}

func (sdb SqlDb) Close(db *gorm.DB) {
	dbx, _ := db.DB()
	dbx.Close()
}

type Basedef struct {
	User   string
	Tenant string
	App    string
}

var Default = Basedef{User: "admin", Tenant: "ACME", App: "XManage"}

func (sdb SqlDb) CreateTable(db *gorm.DB, tablename string) error {
	log.Info("Creating ", tablename)

	if tablename == "Realms" {
		db.AutoMigrate(&dbRealm{})
		// Create
		sEnc := b64.StdEncoding.EncodeToString([]byte(Default.Tenant))
		tenantID := GetMD5Hash(sEnc)
		sEnc = b64.StdEncoding.EncodeToString([]byte(Default.User))
		userID := GetMD5Hash(sEnc)

		db.Create(&dbRealm{ID: tenantID, Name: Default.Tenant, Active: true,
			Owner: userID, Type: "org", Tenant: Default.Tenant})
		var realm dbRealm
		db.First(&realm, "ID = ?", tenantID)
		db.Model(&realm).Update("Tenant", Default.Tenant)
		// db.First(&realm, "ID = ?", tenantID)
		// db.Delete(&realm)
		// db.Commit()
		return nil
	}

	if tablename == "Tasks" {
		log.Info("Creating Tasks")
		db.AutoMigrate(&dbTask{})
		// Create
		db.Create(&dbTask{ID: "24242424", Text: "Have fun", Completed: true,
			Due: time.Now(), UID: "BDE455687CADDE",
		})
		var task dbTask
		db.First(&task, "ID = ?", "24242424")
		db.Model(&task).Update("Text", "Eat Lunch!")
		db.First(&task, "24242424")
		db.Delete(&task)
		// db.Commit()

		return nil
	}

	return errors.New("Unknown Table: " + tablename)
}

func (k KvDb) OpenInit(dbname string) (*bolt.DB, error) {
	bdb, err := bolt.Open(dbname, 0600, nil)
	if err != nil {
		log.Fatalln("Error: ", dbname, " ", err)
		return nil, err
	}

	log.Println("Opened ", dbname)
	return bdb, nil
}

func (k KvDb) Close(db *bolt.DB) {
	defer db.Close()
}

func (k KvDb) BucketCreate(bdb *bolt.DB, bucket string) error {
	err := bdb.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists([]byte(bucket))
		if err != nil {
			return fmt.Errorf("create bucket: %s", err)
		}
		return nil
	})
	return err
}

func (k KvDb) BucketDelete(bdb *bolt.DB, bucket string) error {
	err := bdb.Update(func(tx *bolt.Tx) error {
		err := tx.DeleteBucket([]byte(bucket))
		if err != nil {
			return fmt.Errorf("delete bucket: %s", err)
		}
		return nil
	})
	return err
}

func (k KvDb) BucketShow(bdb *bolt.DB, bucket string) error {
	err := bdb.View(func(tx *bolt.Tx) error {
		// Assume bucket exists and has keys
		b := tx.Bucket([]byte(bucket))

		b.ForEach(func(k, v []byte) error {
			fmt.Printf("key=%s, value=%s\n", k, v)
			return nil
		})
		return nil
	})
	return err
}

func (k KvDb) BucketList(bdb *bolt.DB, bucket string) error {
	err := bdb.View(func(tx *bolt.Tx) error {
		// Assume bucket exists and has keys
		b := tx.Bucket([]byte(bucket))

		b.ForEach(func(k, v []byte) error {
			fmt.Println(string(v))
			return nil
		})
		return nil
	})
	return err
}

func (k KvDb) AddUserDefaults(bdb *bolt.DB) error {

	var user User

	// admin user
	user.ID = ""
	user.Username = "admin"
	user.Name = "Admin"
	user.Email = "foo@bar"
	user.Role = "Owner"
	currentTime := time.Now()
	user.CreatedAt = currentTime.String()
	user.LastAccess = currentTime.String()
	realmName := "AcmeD"
	user.Realms = append(user.Realms, realmName)

	var uaccess UserAccess
	// Add a Record
	err := uaccess.AddUser(UserDB, user)
	if err != nil {
		log.Errorln(err)
		return err
	}
	log.Println("Added ", user)
	return nil
}

func (k KvDb) AddAppDefaults(bdb *bolt.DB) error {

	var app App

	app.Name = "XManage"
	app.Active = true
	realmName := "AcmeD"

	app.Realms = append(app.Realms, realmName)
	var aaccess AppAccess
	// Add a Record
	err := aaccess.UpdateApp(UserDB, app)
	if err != nil {
		log.Errorln(err)
		return err
	}
	log.Println("Added ", app)
	return nil

}

func (sdb SqlDb) AddRealmDefaults(db *gorm.DB) error {

	// admin domain
	var err error
	var realm Realm
	realmName := "AcmeN"
	userName := "admin"

	realm.Name = realmName
	realm.Active = true
	realm.Owner = userName
	realm.Type = "org"
	realm.Tenant = realmName
	realm.AuthProvider = "google"
	// add default admin user to default realm
	var raccess RealmAccess
	ID, err := raccess.AddRealm(db, realm)
	if err != nil {
		log.Error(err)
		return err
	}
	realm.ID = ID
	log.Println("Added ", realm)

	return nil
}

/*

func OrgDbxInit(Cfg Config) (*gorm.DB, error) {
	var err error
	var dbhandle *gorm.DB
	// SQL below
	dbpath := Cfg.Datavol + "/" + "orgs.db"
	if _, err = os.Stat(dbpath); os.IsNotExist(err) {
		dbhandle, err = ConnectDB(dbpath)
		if err != nil {
			log.Error(err)
			return nil, err
		}
		if err = CreateTableRealm(dbhandle); err != nil {
			log.Error(err)
			return nil, err
		}
	} else {
		dbhandle, err = OpenSQL(dbpath)
		if err != nil {
			log.Error(err)
			return nil, err
		}
	}
	return dbhandle, nil
}

func TaskDbxInit(Cfg Config) (*gorm.DB, error) {

	var dbhandle *gorm.DB
	dbpath := Cfg.Datavol + "/" + "tasks.db"
	if _, err := os.Stat(dbpath); os.IsNotExist(err) {
		dbhandle, err = ConnectDB(dbpath)
		if err != nil {
			log.Error(err)
			return nil, err
		}
		if err = CreateTableTask(dbhandle); err != nil {
			log.Error(err)
			return nil, err
		}
	} else {
		dbhandle, err = OpenSQL(dbpath)
		if err != nil {
			log.Error(err)
			return nil, err
		}
	}
	return dbhandle, nil
}

*/
