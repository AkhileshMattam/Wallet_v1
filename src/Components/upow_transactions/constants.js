// import { ec as EC } from 'elliptic';
import pkg from 'elliptic';
const { ec: EC } = pkg;

const ENDIAN = "little";
const SMALLEST = 100000000;
const MAX_SUPPLY = 18884643;
const VERSION = 1;
const MAX_BLOCK_SIZE_HEX = 4096 * 1024; // 4MB in HEX format, 2MB in raw bytes
const MAX_INODES = 12;
const CURVE = new EC('p256');

export { ENDIAN, SMALLEST, MAX_SUPPLY, VERSION, MAX_BLOCK_SIZE_HEX, MAX_INODES, CURVE };
