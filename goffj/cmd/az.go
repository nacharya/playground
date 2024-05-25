package cmd

import (
	"os"
	// "goffj/core"
	"goffj/cloud"
	// log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// cfgCmd represents the cfg command
var azCmd = &cobra.Command{
	Use:   "az",
	Short: "Work with az",
	Long:  `Work with az`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			cmd.Help()
			os.Exit(0)
		}
		cloud.AzInit()
	},
}

func init() {
	rootCmd.AddCommand(azCmd)
}
