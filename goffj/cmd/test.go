package cmd

import (
	"errors"
	"fmt"
	"goffj/core"

	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var testCmd = &cobra.Command{
	Use:   "test",
	Short: "Initialize the settings for the xdata server ",
	Long:  `Initialize the settings for the xdata server`,
	Run: func(cmd *cobra.Command, args []string) {

		if len(args) > 0 {

			testname := args[0]
			err := InitDB(false)
			if err != nil {
				fmt.Println("Unable to access DB ", err)
				return
			}
			fmt.Println("Starting ", args[0], " tests ...")

			switch testname {
			case "user":
				UserTest(Cfg)
			case "task":
				TaskTest(Cfg)
			case "realm":
				RealmTest(Cfg)
			case "show":
				ShowTest(Cfg)
			default:
				fmt.Println("test [ user | task | realm | app ]")
			}

		} else {
			fmt.Println("test [ user | task | realm | show ]")
		}
	},
}

func init() {
	rootCmd.AddCommand(testCmd)
}

func RealmTest(cfg core.Config) {

	var realm core.Realm

	realm.Name = "AcmeX"
	realm.Active = true
	realm.Type = "org"
	realm.Owner = "admin"
	realm.Tenant = "Acme Corp"

	// Add a Record
	log.Println("Adding ", realm)
	var raccess core.RealmAccess
	ID, err := raccess.AddRealm(core.RealmDB, realm)
	if err != nil {
		log.Errorln(err)
		return
	}
	realm.ID = ID
	// let's get it back
	t, err := raccess.GetRealm(core.RealmDB, realm.Name)
	if err != nil {
		log.Errorln(err)
		return
	}
	log.Println("Realm: ", t.Name, " ID: ", t.ID)
	realm.Tenant = "Updates Corp Acme"
	err = raccess.UpdateRealm(core.RealmDB, realm)
	if err != nil {
		log.Errorln(err)
		return
	}
	// delete
	err = raccess.DeleteRealm(core.RealmDB, realm.Name)
	if err != nil {
		log.Errorln(err)
		return
	}
	// get
	t, err = raccess.GetRealm(core.RealmDB, realm.Name)
	if err == nil {
		log.Errorln(err)
		return
	}
	fmt.Println("Realm tests completed")

}

func UserTest(Cfg core.Config) {
	var user core.User

	user.ID = ""
	user.Email = "foo@bar"
	user.Name = "Foo Bar"

	var err error

	var uaccess core.UserAccess
	// Add a Record
	err = uaccess.AddUser(core.UserDB, user)
	if err != nil {
		log.Errorln(err)
		return
	}
	// Get a record
	u, err := uaccess.GetUser(core.UserDB, user.Username)
	if err != nil {
		log.Errorln(err)
		return
	}
	// Update the record
	u.Name = "hola"
	err = uaccess.UpdateUser(core.UserDB, u)
	if err != nil {
		log.Errorln(err)
		return
	}
	// delete
	err = uaccess.RemoveUser(core.UserDB, user.Username)
	if err != nil {
		log.Errorln(err)
		return
	}
	// get
	log.Println("Looking for ", user.Username)
	u, err = uaccess.GetUser(core.UserDB, user.Username)
	if err == nil {
		log.Errorln(err)
		return
	}
	fmt.Println("User tests completed")
}

func TaskTest(cfg core.Config) {

	var task core.Task

	task.ID = "ABCDEFABCDEF"
	task.Text = "Keep moving"
	// task.UID = "FFFFFF"
	task.Completed = false

	var taccess core.TaskAccess
	// Add a Record
	err := taccess.AddTask(core.TaskDB, task)
	if err != nil {
		log.Errorln(err)
		return
	}
	// Get a record
	ID := "ABCDEFABCDEF"
	t, err := taccess.GetTask(core.TaskDB, ID)
	if err != nil {
		log.Errorln(err)
		return
	}
	if t.ID != task.ID {
		log.Errorln(errors.New("Mismatched ID"))
		return
	}
	task.Text = "Foo bar update"
	// Update the record
	err = taccess.UpdateTask(core.TaskDB, task)
	if err != nil {
		log.Errorln(err)
		return
	}
	// delete
	err = taccess.DeleteTask(core.TaskDB, ID)
	if err != nil {
		log.Errorln(err)
		return
	}
	// get
	t, err = taccess.GetTask(core.TaskDB, ID)
	if err == nil {
		log.Errorln(err)
		return
	}
	fmt.Println("Task tests completed")
}

func ShowTest(Cfg core.Config) {

	var uaccess core.UserAccess
	userlist := uaccess.GetUsers(core.UserDB)
	for k, v := range userlist {
		fmt.Println(k, " = ", v)
	}
	var taccess core.TaskAccess
	tasks := taccess.ListTasks(core.TaskDB)
	for k, v := range tasks {
		fmt.Println(k, " = ", v)
	}

	var raccess core.RealmAccess
	realms, _ := raccess.GetRealmList(core.RealmDB)
	for k, v := range realms {
		fmt.Println(k, " = ", v)
	}
}
