const _ = require("lodash");
const puppeteer = require('puppeteer');
const raw = require ("raw-socket");
const portscanner = require('portscanner');
const socket = raw.createSocket({protocol: raw.Protocol.ICMP});
require('events').EventEmitter.defaultMaxListeners = 1048576;

class NetUtility{

  constructor(){
    this.socket = raw.createSocket({
      protocol: raw.Protocol.ICMP
    });

    this.aliveHosts = [];
    this.socket.on("message", (buffer, source) => {
      this.aliveHosts.push(source);
      this.aliveHosts = _.uniq(this.aliveHosts);
    });

  }

  getHostRangeByNetworkClass(hostClass) {
    hostClass = hostClass.toUpperCase();
    let hostRange = []
    switch(hostClass){

      case "A":
        hostRange = this.classAHosts;
        break;

      case "B":
        hostRange = this.classBHosts;
        break;

      case "C":
        hostRange = this.classCHosts;
        break;

      default:
        throw new Error("Please enter host network class A, B, or C")
    }
    return hostRange;
  }

  // Defaults to C
  async scanNetwork(hostClass = "C"){
    const hostRange = this.getHostRangeByNetworkClass(hostClass);
    console.log(`Scanning all ${hostRange.length} class ${hostClass} hosts in the network...`)
    return new Promise((resolve, reject) => {
      const promises = [];
      hostRange.forEach(host => {
        const promise = this.ping(host);
        promises.push(promise);
      })
      Promise.all(promises).then(values => {
        resolve(this.aliveHosts);
      });
    })
  }

  // 10.0.0.0 – 10.255.255.255
  get classAHosts(){
    if(!this._classAHosts){
      this._classAHosts = [];
      for(let i = 0; i <= 255; i++){
        for(let j = 0; j <= 255; j++){
          for(let k = 0; k <= 255; k++){
            this._classAHosts.push(`10.${i}.${j}.${k}`);
          }
        }
      }
    }
    return this._classAHosts;
  }

  // 172.16.0.0 – 172.31.255.25
  get classBHosts(){
    if(!this._classBHosts){
      this._classBHosts = [];
      for(let i = 16; i <= 31; i++){
        for(let j = 0; j <= 255; j++){
          for(let k = 0; k <= 255; k++){
            this._classBHosts.push(`172.${i}.${j}.${k}`);
          }
        }
      }
    }
    return this._classBHosts;
  }

  // 192.168.0.0 – 192.168.255.255
  get classCHosts(){
    if(!this._classCHosts){
      this._classCHosts = [];
      for(let i = 0; i <= 255; i++){
        for(let j = 0; j <= 255; j++){
          this._classCHosts.push(`192.168.${i}.${j}`);
        }
      }
    }
    return this._classCHosts;
  }

  createICMPHeader(data="") {
    const datastr = String(data);
    // We need 8 bytes (4 octets) for ICMP headers and 1 byte more per data's char
    const header = Buffer.alloc(8 + datastr.length);
    // Fill data part to prevent network leaking
    header.fill(0, 8);
    // Type
    header.writeUInt8(8, 0);
    header.writeUInt8(0, 1);
    header.writeUInt16BE(0, 2);
    header.writeUInt16LE(process.pid % 65535, 4);
    header.write(datastr, 8);
    return raw.writeChecksum(header, 2, raw.createChecksum(header));
  }

  // MERGE THIS WITH SCAN METHOD
  ping(host, timeout=5000){
    return new Promise((resolve, reject) => {
      const header = this.createICMPHeader();

      this.socket.send(header, 0, header.length, host, (err, bytes) => {
        if (err) {
          return reject(err);
        }

        this._timeout = setTimeout(() => {
          resolve();
        }, timeout);

        this.start = process.hrtime();
      });
    })
  }

  isPortOpen(host, port){
    return new Promise((resolve, reject) => {
      portscanner.checkPortStatus(port, host, function(err, status){
        if(err){
          reject()
        } else {
          // Returns true if open
          resolve(status === "open")
        }
      })
    })
  }
}


async function run(){
  const net = new NetUtility();
  const aliveHosts = await net.scanNetwork("C");
  const browser = await puppeteer.launch({headless: false});
  aliveHosts.forEach(async host => {
    let err, isPortOpen = await net.isPortOpen(host, 80);
    const page = await browser.newPage();
    await page.goto(`http://${host}:80`, { waitUntil: 'load', timeout: 0 })
      .then(res => {})
      .catch(err => {})
    console.log(`Host ${host} has port 80 open`);
  })
}

run();


