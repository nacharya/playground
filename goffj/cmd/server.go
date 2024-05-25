package cmd

import (
	"os"
	"goffj/core"
	"goffj/router"

	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// cfgCmd represents the cfg command
var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "Work with starting and stopping the goffj server ",
	Long:  `Work with starting and stopping the goffj server`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			cmd.Help()
			os.Exit(0)
		}
	},
}

var serverStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Work with starting and stopping the farmexec service ",
	Long:  `Work with starting and stopping the farmexec service`,
	Run: func(cmd *cobra.Command, args []string) {
		var addr string = ":9901"
		if Cfg.Name == "xdata" {
			addr = Cfg.Port
			log.Println("Using ", addr)
		}

		// go core.NATSinit()
		err := InitDB(true)
		if err != nil {
			log.Println("Unable to access DB")
			return
		}
		router.ServerRouter(core.Mr.Router, Cfg)
	},
}

func init() {
	rootCmd.AddCommand(serverCmd)
	serverCmd.AddCommand(serverStartCmd)
}

func InitDB(bootup bool) error {
	var err error
	// Now initialize the DB
	log.Println("Starting to initialize ...")

	basepath := Cfg.Datavol
	core.UserDB, err = core.UserDBAccess.OpenInit(basepath + "/" + Cfg.UserDB)
	if err != nil {
		log.Error("Error: ", err)
		return err
	}

	core.RealmDB, err = core.RealmDBAccess.OpenInit(basepath + "/" + Cfg.RealmDB)
	if err != nil {
		log.Error("Error: ", err)
		return err
	}

	core.TaskDB, err = core.TaskDBAccess.OpenInit(basepath + "/" + Cfg.TaskDB)
	if err != nil {
		log.Error("Error: ", err)
		return err
	}

	if bootup == false {

		err = core.UserDBAccess.BucketCreate(core.UserDB, "Users")
		if err != nil {
			log.Error("Error: ", err)
			return err
		}
		err = core.UserDBAccess.BucketCreate(core.UserDB, "Apps")
		if err != nil {
			log.Error("Error: ", err)
			return err
		}

		err = core.RealmDBAccess.CreateTable(core.RealmDB, "Realms")
		if err != nil {
			log.Error("Error: ", err)
			return err
		}

		err = core.TaskDBAccess.CreateTable(core.TaskDB, "Tasks")
		if err != nil {
			log.Error("Error: ", err)
			return err
		}

		log.Println("Adding default users and tenants")
		err = core.UserDBAccess.AddUserDefaults(core.UserDB)
		if err != nil {
			log.Error("Error: ", err)
			return err
		}
		err = core.RealmDBAccess.AddRealmDefaults(core.RealmDB)
		if err != nil {
			log.Error("Error: ", err)
			return err
		}
		err = core.UserDBAccess.AddAppDefaults(core.UserDB)
		if err != nil {
			log.Error("Error: ", err)
			return err
		}

	}
	log.Println("Init done !")
	return nil
}
