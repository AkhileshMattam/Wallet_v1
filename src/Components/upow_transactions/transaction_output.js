// transaction.js

// Import necessary modules and constants
import { SMALLEST, ENDIAN, CURVE } from './constants.js';
import { byte_length, string_to_point, string_to_bytes, OutputType } from './helpers.js';
// import { OutputType } from './constants.js';
import pkg from 'elliptic';


const { ec: EC } = pkg;

// Initialize elliptic curve
const curve = new EC('p256');

// Define the TransactionOutput class
class TransactionOutput {
    constructor(address, amount, transaction_type = OutputType.REGULAR) {
        this.address = address;
        this.address_bytes = string_to_bytes(address);
        this.public_key = string_to_point(address);
        if (!Number.isInteger(amount * SMALLEST)) {
            throw new Error('too many decimal digits');
        }
        this.amount = amount;
        this.transaction_type = transaction_type;
        this.is_stake = transaction_type === OutputType.STAKE;
    }

    tobytes() {
        const amount = Math.round(this.amount * SMALLEST);
        const count = byte_length(amount);
        return Buffer.concat([
            this.address_bytes,
            Buffer.from([count]),
            Buffer.from(amount.toString(16).padStart(count * 2, '0'), 'hex'),
            Buffer.from([this.transaction_type])
        ]);
    }

    verify() {
        return this.amount > 0 && CURVE.keyFromPublic(this.public_key).validate().result;
    }

    get as_dict() {
        const res = { ...this };
        delete res.public_key;
        return res;
    }
}

export { TransactionOutput, curve };
