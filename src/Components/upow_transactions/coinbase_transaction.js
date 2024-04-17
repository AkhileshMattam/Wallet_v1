import { ENDIAN } from './constants.js';
import { sha256 } from './helpers.js';
import { InputType } from './helpers.js';
import { TransactionOutput } from './transaction_output.js';

class CoinbaseTransaction {
    constructor(block_hash, address, amount) {
        this.block_hash = block_hash;
        this.address = address;
        this.amount = amount;
        this.outputs = [new TransactionOutput(address, amount)];
        this._hex = null;
    }

    hex() {
        if (this._hex !== null) {
            return this._hex;
        }

        const hex_inputs = Buffer.concat([Buffer.from(this.block_hash, 'hex'), Buffer.from([0])]).toString('hex') +
            InputType.REGULAR.value.toString('hex');

        const hex_outputs = this.outputs.map(tx_output => tx_output.tobytes().toString('hex')).join('');

        let version;
        if (this.outputs.every(tx_output => tx_output.address_bytes.length === 64)) {
            version = 1;
        } else if (this.outputs.every(tx_output => tx_output.address_bytes.length === 33)) {
            version = 2;
        } else {
            throw new Error('Unsupported output address length');
        }

        this._hex = [
            version.toString('hex'),
            '01', // Assuming always 1 byte for inputs count
            hex_inputs,
            this.outputs.length.toString('hex'),
            hex_outputs,
            '24' // Assuming always 36 bytes for the hash
        ].join('');

        return this._hex;
    }

    hash() {
        return sha256(this.hex());
    }
}

export { CoinbaseTransaction };
