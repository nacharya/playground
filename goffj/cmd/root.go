package cmd

import (
	"goffj/core"

	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "xdn",
	Short: "Allow goffj to access a queue start a server",
	Long:  `A CLI application with an internal API that allows events and exernal API`,
	// Uncomment the following line if your bare application
	// has an action associated with it:
	// Run: func(cmd *cobra.Command, args []string) { fmt.Println("Hello CLI") },
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the rootCmd.
func Execute() {
	cobra.CheckErr(rootCmd.Execute())
}

func init() {
	cobra.OnInitialize(XdnInit)
}

var Cfg core.Config

func XdnInit() {

	// log.Println("Starting goffj ...")
	err := ConfigInit()
	if err != nil {
		return
	}
	
	// log.Println("Configuration: ", Cfg.Name)
	logger, lf := LoggerInit("xdn.log", Cfg.Loglevel)
	// this is based on the verbose flag in the config
	if Cfg.Loglevel == "debug" {
		// either a TraceLevel or a DebugLevel
		// Trace is more verbose
		log.SetLevel(log.TraceLevel)
		log.Debug("xdn config verbose")
	}
	GinFrameworkInit(logger, lf)

}
