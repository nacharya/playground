package cmd

import (
	"os"
	"fmt"
	// "goffj/core"
	// "goffj/cloud"
	// log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var realmCmd = &cobra.Command{
	Use:   "realm",
	Short: "Work with realm",
	Long:  `Work with realm`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			cmd.Help()
			os.Exit(0)
		}
		if len(args) > 0 {
			fmt.Println("Starting ", args[0], " realm ...")
			cmdname := args[0]
			switch cmdname {
			case "add":
				RealmAdd(args[1])
			case "del":
				RealmDel(args[1])
			case "list":
				RealmList()
			case "show":
				RealmShow(args[1])
			default:
				fmt.Println("realm [ add | del | list | show ]")

			}
		}
	},
}

func init() {
	rootCmd.AddCommand(realmCmd)
}


func RealmAdd(name string) {
	fmt.Println(name)
}

func RealmDel(name string) {
	fmt.Println(name)
}

func RealmShow(name string) {
	fmt.Println(name)
}

func RealmList() {
	fmt.Println("List")
	
}



