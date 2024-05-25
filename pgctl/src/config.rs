use anyhow::anyhow;
use serde_derive::{Deserialize, Serialize};
use std::fs;
use std::fs::{File, OpenOptions};

#[derive(Serialize, Deserialize)]
pub struct PgctlConfig {
    pub name: String,
    pub hostname: String,
    pub port: i32,
    pub udpport: i32,
    pub loglevel: String,
}

#[derive(Serialize, Deserialize)]
pub struct Peer {
    pub name: String,
    pub hostname: String,
    pub port: i32,
    pub udpport: i32,
}

#[derive(Serialize, Deserialize)]
pub struct PeerConfig {
    pub peers: [Peer; 16],
}

fn dump_config(instance: &PgctlConfig, filename: &str) -> anyhow::Result<()> {
    let file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(filename)?;

    serde_json::to_writer_pretty(file, instance)?;

    Ok(())
}

pub fn read_config() -> anyhow::Result<PgctlConfig, anyhow::Error> {
    let homedir = dirs::home_dir().ok_or_else(|| anyhow!("Cannot get home directory"))?;
    let filename = format!("{}/.config/pgctl/pgctl", homedir.as_path().display());

    if let Ok(metadata) = std::fs::metadata(filename.clone()) {
        if metadata.is_file() {
            let file = File::open(filename)?;
            let reader = std::io::BufReader::new(file);
            let instance: PgctlConfig = serde_json::from_reader(reader)?;
            Ok(instance)
        } else {
            Err(anyhow::anyhow!("{} is not a file", filename))
        }
    } else {
        Err(anyhow::anyhow!("{} not found", filename))
    }
}

pub fn init_config() -> anyhow::Result<PgctlConfig> {
    let homedir = dirs::home_dir().ok_or_else(|| anyhow!("Cannot get home directory"))?;

    let filename = format!("{}/.config/pgctl/pgctl", homedir.as_path().display());
    let cfgdir = format!("{}/.config/pgctl", homedir.as_path().display());
    fs::create_dir_all(cfgdir)?;
    let instance = PgctlConfig {
        name: String::from("pgctl"),
        hostname: String::from("localhost"),
        port: 9090,
        udpport: 9092,
        loglevel: String::from("info"),
    };
    if std::fs::metadata(filename.clone()).is_ok() {
        let _instance = read_config()?;
    } else {
        dump_config(&instance, &filename)?;
    }
    Ok(instance)
}

pub fn show_config() -> std::result::Result<(), anyhow::Error> {
    let instance = read_config()?;
    // Process the instance here if needed
    println!("Name: {}", instance.name);
    println!("Hostname: {}", instance.hostname);
    println!("Port: {}", instance.port);
    println!("UdpPort: {}", instance.udpport);
    println!("Loglevel: {}", instance.loglevel);

    // Continue with the rest of the function logic
    Ok(())
}
