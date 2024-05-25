use anyhow::Result;
use clap::{command, Parser, Subcommand};
// use log::{debug, error, info, warn};
use log::debug;

mod client;
mod config;
mod server;

const EXAMPLES: &str = "Examples:
 With the server model:
    % pgctl server -s
 With the configuration file:
    % pgctl config -i
    % pgctl config -s
";

#[derive(Parser, Debug)]
#[clap(version, after_help=EXAMPLES )]
struct Args {
    #[clap(short = 'c', help = "Configuration for pgctl")]
    config: Option<String>,

    #[clap(short = 's', help = "pgctl server")]
    server: Option<String>,

    #[clap(short = 'l', help = "pgctl client")]
    client: Option<String>,

    #[command(subcommand)]
    cmd: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    #[clap(about = "Manage the configuration ")]
    Config {
        #[clap(short = 's', help = "Show the configuration")]
        show: bool,

        #[clap(short = 'i', help = "Initialize the configuration")]
        init: bool,
    },

    #[clap(about = "Manage the server ")]
    Server {
        #[clap(short = 's', help = "start the server")]
        http: bool,

        #[clap(short = 'u', help = "UDP packet listener")]
        udp: bool,
    },

    #[clap(about = "Manage the server ")]
    Client {
        #[clap(short = 'c', help = "connect to the server")]
        connect: String,
    },
}

fn main() -> Result<()> {
    env_logger::init();
    debug!("pgctl begin");
    let args = Args::parse();

    match args.cmd {
        Commands::Config { init, show } => handle_config_cmd(init, show, args.config)?,
        Commands::Server { http, udp } => handle_server_cmd(http, udp, args.server)?,
        Commands::Client { connect } => handle_client_cmd(connect, args.client)?,
    }

    debug!("pgctl end");
    Ok(())
}

fn handle_config_cmd(init: bool, show: bool, _config: Option<String>) -> Result<()> {
    if init {
        config::init_config()?;
    } else if show {
        config::show_config()?;
    } else {
        println!("subcommand needed e.g.");
        println!(" % pgctl config -i");
        println!(" % pgctl config -s");
    }
    Ok(())
}

fn handle_server_cmd(http: bool, udp: bool, _server: Option<String>) -> Result<()> {
    let cfg = config::read_config()?;
    if http {
        let _ = server::start_server(cfg.hostname, cfg.port);
    } else if udp {
        let server_addr = format!("{}:{}", cfg.hostname, cfg.udpport);
        let _ = server::udp_server(server_addr);
    } else {
        println!("subcommand needed. e.g.");
        println!("  % pgctl server -s ");
        println!("  % pgctl server -t ");
        println!("  % pgctl server -u ");
    }
    Ok(())
}

fn handle_client_cmd(message: String, _client: Option<String>) -> Result<()> {
    let cfg = config::read_config()?;
    let server_addr = format!("{}:{}", cfg.hostname, cfg.udpport);
    let _ = client::connect(server_addr, message);
    Ok(())
}
