package cmd

import (
	"os"
	// "goffj/core"
	"goffj/cloud"
	// log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

// cfgCmd represents the cfg command
var awsCmd = &cobra.Command{
	Use:   "aws",
	Short: "Work with aws",
	Long:  `Work with aws`,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			cmd.Help()
			os.Exit(0)
		}
		cloud.AwsInit()
	},
}

func init() {
	rootCmd.AddCommand(awsCmd)
}
