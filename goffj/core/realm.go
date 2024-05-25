package core

import (
	md5 "crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/boltdb/bolt"
	log "github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

type TaskAccess struct{}
type RealmAccess struct{}

type dbTask struct {
	gorm.Model
	ID        string    `json:"id"`        // ID of the task itself
	Name      string    `json:"name"`      // name of the task ID is derived from
	Text      string    `json:"text"`      // Content of the Task
	Completed bool      `json:"completed"` // of this is completed
	UID       string    `json:"uid"`       // User ID to which this belongs
	Due       time.Time `json:"due"`       // Due date
}

func (t TaskAccess) GetTaskID(Name string) []byte {
	h := sha256.New()
	h.Write([]byte(Name))
	hash := base64.URLEncoding.EncodeToString(h.Sum(nil))
	taskid := string(hash[:])
	return []byte(taskid)
}

func (t TaskAccess) ListTasks(db *gorm.DB) []Task {
	var dtasks []dbTask
	var tasks []Task
	db.Find(&dtasks)
	// result := db.Find(&dtasks)
	// TODO: convert dtasks to tasks
	// before the return
	return tasks
}

func (taccess TaskAccess) AddTask(db *gorm.DB, task Task) error {

	ID := taccess.GetTaskID(task.Name)
	task.ID = string(ID)
	log.Debug("Adding task ", task.ID)

	dtask := dbTask{ID: task.ID, Text: task.Text,
		Completed: task.Completed, Due: task.Due, UID: task.UID}
	// db.Clauses(clause.Insert{Modifier: "or ignore"})
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&dtask).Error; err != nil {
			log.Error(err)
			return err
		}
		return nil
	})

	return err
}

func (taccess TaskAccess) UpdateTask(db *gorm.DB, task Task) error {
	log.Debug("Updating task ", task.ID)

	var dbTask dbTask

	dbTask.ID = task.ID
	dbTask.Text = task.Text
	dbTask.Completed = task.Completed
	dbTask.Due = task.Due
	dbTask.UID = task.UID

	result := db.Model(&dbTask).Updates(map[string]interface{}{"ID": task.ID, "Text": task.Text,
		"Completed": task.Completed, "Due": task.Due, "UID": task.UID})

	if result.Error != nil {
		log.Errorln(result.Error)
		return result.Error
	}

	return nil
}

func (taccess TaskAccess) DeleteTask(db *gorm.DB, Name string) error {

	ID := taccess.GetTaskID(Name)

	log.Debug("Deleting task ", string(ID))
	var dbTask dbTask
	dbTask.ID = string(ID)
	dbTask.Text = ""
	dbTask.Completed = false
	dbTask.Due = time.Now()
	dbTask.UID = ""

	// result := db.Delete(&dbTask{}, ID)
	// result := db.Where("id = ?", ID).Delete(&dbTask{})
	// Delete completely without considering DeletedAt
	result := db.Unscoped().Delete(&dbTask)
	if result.Error != nil {
		log.Errorln(result.Error)
		return result.Error
	}
	return nil
}

func (taccess TaskAccess) GetTask(db *gorm.DB, Name string) (Task, error) {

	ID := taccess.GetTaskID(Name)
	key := string(ID)
	log.Debug("Get task ", key)
	var task Task

	var dbTask dbTask

	// result := db.First(&dbTask, ID)
	result := db.First(&dbTask, "id = ?", key)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		log.Error(result.Error)
		return task, result.Error
	}
	task.ID = dbTask.ID
	task.Text = dbTask.Text
	task.Completed = dbTask.Completed
	task.Due = dbTask.Due
	task.UID = dbTask.UID
	return task, nil
}

type dbRealm struct {
	gorm.Model
	ID           string `json:"id"` // ID of the realm itself
	Deleted      gorm.DeletedAt
	Name         string `json:"text"`         // Content of the Task
	Active       bool   `json:"completed"`    // of this is completed
	Type         string `json:"type"`         // type
	Owner        string `json:"owner"`        // Owner ID to which this belongs
	Tenant       string `json:"tenant"`       // tenant
	AuthProvider string `json:"authprovider"` // auth
}

func GetMD5Hash(text string) string {
	hash := md5.Sum([]byte(text))
	return hex.EncodeToString(hash[:])
}

// Create a ID based on a string if the ID is not available
func (r RealmAccess) GetRealmID(realmname string) []byte {
	h := sha256.New()
	h.Write([]byte(realmname))
	hash := base64.URLEncoding.EncodeToString(h.Sum(nil))
	realmid := string(hash[:])
	return []byte(realmid)
}

func (r RealmAccess) GetRealmList(db *gorm.DB) ([]Realm, error) {
	var drealms []dbRealm
	var realms []Realm
	db.Find(&drealms)
	// result := db.Find(&drealms)
	// TODO: convert drealms to realms
	return realms, nil
}

func (r RealmAccess) AddRealm(db *gorm.DB, realm Realm) (string, error) {
	realm.ID = string(r.GetRealmID(realm.Name))
	log.Debug("Adding realm ", realm.Name, " ID ", realm.ID)
	drealm := dbRealm{ID: realm.ID, Name: realm.Name, Active: realm.Active,
		Owner: realm.Owner, Type: realm.Type, Tenant: realm.Tenant}
	result := db.Create(&drealm)
	if result.Error != nil {
		log.Error(result.Error)
		return "", result.Error
	}
	// db.Commit()
	return realm.ID, nil
}

func (r RealmAccess) UpdateRealm(db *gorm.DB, realm Realm) error {
	log.Debug("Updating realm ", realm.Name)

	var dbRealm dbRealm

	dbRealm.ID = string(r.GetRealmID(realm.Name))
	dbRealm.Name = realm.Name
	dbRealm.Active = realm.Active
	dbRealm.Owner = realm.Owner
	dbRealm.Type = realm.Type
	dbRealm.Tenant = realm.Tenant
	dbRealm.AuthProvider = realm.AuthProvider

	realm.ID = dbRealm.ID
	result := db.Model(&dbRealm).Updates(map[string]interface{}{"ID": realm.ID, "Name": realm.Name,
		"Active": realm.Active, "Owner": realm.Owner, "Type": realm.Type,
		"Tenant": realm.Tenant, "AuthProvider": realm.AuthProvider})

	if result.Error != nil {
		log.Errorln(result.Error)
		return result.Error
	}
	/* Option: find the record and pdate the fields
	result := db.Select("ID", "Name", "Active", "Owner", "Type", "Tenant").Create(&drealm)
	if result.Error != nil {
		log.Errorln(result.Error)
		return result.Error
	}
	*/
	// db.Commit()
	return nil
}

func (r RealmAccess) DeleteRealm(db *gorm.DB, name string) error {
	log.Debug("Deleting realm ", name)

	var ID string = string(r.GetRealmID(name))
	var dbRealm dbRealm
	dbRealm.ID = ID
	dbRealm.Active = false
	dbRealm.Name = name
	dbRealm.Owner = ""

	//result := db.Delete(&dbRealm{}, ID)
	// result := db.Where("id = ?", ID).Delete(&dbRealm{})
	result := db.Unscoped().Delete(&dbRealm)
	if result.Error != nil {
		log.Errorln(result.Error)
		return result.Error
	}
	// db.Commit()

	return nil
}

func (r RealmAccess) GetRealm(db *gorm.DB, name string) (Realm, error) {

	var realm Realm

	ID := string(r.GetRealmID(name))
	log.Println("Get Realm:  ", name, "  ", ID)
	var dbRealm dbRealm

	// result := db.First(&dbTask, ID)
	result := db.First(&dbRealm, "id = ?", ID)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		log.Error(result.Error)
		return realm, result.Error
	}

	realm.ID = dbRealm.ID
	realm.Name = dbRealm.Name
	realm.Active = dbRealm.Active
	realm.Owner = dbRealm.Owner
	realm.Tenant = dbRealm.Tenant
	log.Println("DB Get Realm:  ", realm.Name, "  ", realm.ID)

	return realm, nil
}

// A function to get Realm users
func (r RealmAccess) GetRealmUsers(db *bolt.DB, name string) ([]User, error) {
	var userlist []User
	var err error = nil

	bucket := "Users"
	index := 0
	_ = db.View(func(tx *bolt.Tx) error {
		// Assume bucket exists and has keys
		b := tx.Bucket([]byte(bucket))
		b.ForEach(func(k, v []byte) error {
			var user User
			json.Unmarshal(v, &user)
			for _, item := range user.Realms {
				if item == name {
					userlist[index] = user
					index++
				}
			}
			return nil
		})
		return nil
	})

	return userlist, err
}

// A function to get Realm apps
func (r RealmAccess) GetRealmApps(db *bolt.DB, name string) ([]App, error) {
	var applist []App
	var err error = nil

	bucket := "Apps"
	index := 0
	_ = db.View(func(tx *bolt.Tx) error {
		// Assume bucket exists and has keys
		b := tx.Bucket([]byte(bucket))
		b.ForEach(func(k, v []byte) error {
			var app App
			json.Unmarshal(v, &app)
			for _, item := range app.Realms {
				if item == name {
					applist[index] = app
					index++
				}
			}
			return nil
		})
		return nil
	})

	return applist, err
}

func (r RealmAccess) DeleteUserFromRealm(UserDB *bolt.DB, userName string, realmName string) error {
	uaccess := UserAccess{}
	user, err := uaccess.GetUser(UserDB, userName)
	if err != nil {
		log.Error(err)
		return err
	}
	found := false
	for i, other := range user.Realms {
		if other == realmName {
			found = true
			user.Realms = append(user.Realms[:i], user.Realms[i+1:]...)
		}
	}
	log.Debug(userName, " ", realmName, "  found: ", found)
	return nil
}

func (r RealmAccess) AddUserToRealm(UserDB *bolt.DB, userName string, realmName string) error {
	log.Debug("Adding user ", userName, " to realm ", realmName)
	var user User

	uaccess := UserAccess{}
	// get the user record with this user ID
	user, err := uaccess.GetUser(UserDB, userName)
	if err != nil {
		log.Error(err)
		return err
	}

	// Now update the Realms list with this realmID
	found := false
	for _, item := range user.Realms {
		if item == realmName {
			// Entry already exists, no need to update
			found = true
			break
		}
	}
	if !found {
		user.Realms = append(user.Realms, realmName)
	}
	// Update the new user record in the user DB
	err = uaccess.UpdateUser(UserDB, user)
	if err != nil {
		log.Error(err)
		return err
	}

	return nil
}

func (r RealmAccess) AddAppToRealm(AppDB *bolt.DB, appName string, realmName string) error {
	log.Debug("Adding app ", appName, " to realm ", realmName)
	var app App

	appaccess := AppAccess{}
	// get the user record with this user ID
	app, err := appaccess.GetApp(AppDB, appName)
	if err != nil {
		log.Error(err)
		return err
	}

	// Now update the Realms list with this realmID
	found := false
	for _, item := range app.Realms {
		if item == realmName {
			// Entry already exists, no need to update
			found = true
			break
		}
	}
	if !found {
		app.Realms = append(app.Realms, realmName)
	}
	// Update the new user record in the user DB
	err = appaccess.UpdateApp(AppDB, app)
	if err != nil {
		log.Error(err)
		return err
	}
	return nil
}

func (r RealmAccess) DeleteAppFromRealm(db *bolt.DB, appName string, realmName string) error {
	appaccess := AppAccess{}
	app, err := appaccess.GetApp(UserDB, appName)
	if err != nil {
		log.Error(err)
		return err
	}
	found := false
	for i, other := range app.Realms {
		if other == realmName {
			found = true
			app.Realms = append(app.Realms[:i], app.Realms[i+1:]...)
		}
	}
	log.Debug(appName, " ", realmName, "  found: ", found)
	return nil
}
