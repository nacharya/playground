// use anyhow::Result;
use std::net::UdpSocket;
use std::str;

pub fn connect(server_addr: String, message: String) -> anyhow::Result<()> {
    let socket = UdpSocket::bind("[::]:0")?;
    socket
        .send_to(message.as_bytes(), server_addr)
        .expect("Error on send");

    let mut buf = [0; 2048];
    let (amt, _src) = socket.recv_from(&mut buf)?;

    let echo = str::from_utf8(&buf[..amt]).unwrap();
    println!("Echo {}", echo);

    Ok(())
}
