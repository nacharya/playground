package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize the settings for the xdata server ",
	Long:  `Initialize the settings for the xdata server`,
	Run: func(cmd *cobra.Command, args []string) {
		err := InitDB(false)
		if err != nil {
			fmt.Println("Unable to access DB")
			return
		}
	},
}

func init() {
	rootCmd.AddCommand(initCmd)
}
