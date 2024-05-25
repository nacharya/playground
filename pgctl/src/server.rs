use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use log::{debug, info};
// use std::net::{SocketAddr, UdpSocket};
use std::net::UdpSocket;

// use anyhow::ensure;
// use log::{debug, error, info, warn};

#[get("/")]
async fn hello() -> impl Responder {
    HttpResponse::Ok().body("Hello world!")
}

#[post("/echo")]
async fn echo(req_body: String) -> impl Responder {
    HttpResponse::Ok().body(req_body)
}

async fn manual_hello() -> impl Responder {
    HttpResponse::Ok().body("Hey there!")
}

#[actix_web::main]
pub async fn start_server(hostname: String, port: i32) -> std::io::Result<()> {
    info!("Starting server {} {}", hostname, port);
    let addr = format!("{}:{}", hostname, port);

    let server = HttpServer::new(|| {
        App::new()
            .service(hello)
            .service(echo)
            .route("/hey", web::get().to(manual_hello))
    })
    .bind(addr.as_str())
    .unwrap()
    .run();
    debug!("Server live at http://{}", addr);
    server.await.unwrap();
    Ok(())
}

pub fn udp_server(server_addr: String) -> std::io::Result<()> {
    println!("server: {}", server_addr);
    // let socket = UdpSocket::bind("[::]:2000")?;  // for UDP4/6
    let socket = UdpSocket::bind(server_addr)?; // for UDP4/6
    let mut buf = [0; 2048];
    loop {
        // Receives a single datagram message on the socket.
        // If `buf` is too small to hold
        // the message, it will be cut off.
        let (amt, src) = socket.recv_from(&mut buf)?;

        // Redeclare `buf` as slice of the received data
        // and send data back to origin.
        let buf = &mut buf[..amt];
        let s = match std::str::from_utf8(buf) {
            Ok(v) => v,
            Err(e) => panic!("Invalid UTF-8 sequence: {}", e),
        };

        println!("Received: {}", s);
        socket.send_to(buf, src)?;
    }
}
