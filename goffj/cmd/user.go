package cmd

import (
	"os"
	"fmt"
	// "goffj/core"
	// "goffj/cloud"
	// log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var userCmd = &cobra.Command{
	Use:   "user",
	Short: "Work with user",
	Long:  `Work with user`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			cmd.Help()
			os.Exit(0)
		}
		if len(args) > 0 {
			fmt.Println("Starting ", args[0], " user ...")
			cmdname := args[0]
			switch cmdname {
			case "add":
				UserAdd(args[1])
			case "del":
				UserDel(args[1])
			case "list":
				UserList()
			case "show":
				UserShow(args[1])
			default:
				fmt.Println("user [ add | del | list | show ]")

			}
		}
	},
}

func init() {
	rootCmd.AddCommand(userCmd)
}


func UserAdd(name string) {
	fmt.Println(name)
}

func UserDel(name string) {
	fmt.Println(name)
}

func UserShow(name string) {
	fmt.Println(name)
}

func UserList() {
	fmt.Println("List")

}
