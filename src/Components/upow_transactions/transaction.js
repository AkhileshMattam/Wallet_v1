// Import necessary modules and constants
import { ENDIAN, SMALLEST, CURVE } from './constants.js';
import { get_transaction_type_from_message, sha256, bytes_to_string, point_to_string } from './helpers.js';
import { InputType, OutputType } from './helpers.js';
import { TransactionInput } from './transaction_input.js';
import { TransactionOutput } from './transaction_output.js';
import { CoinbaseTransaction } from './coinbase_transaction.js';
import { NotImplementedError } from './not_implemented_error.js';

class Transaction {
    constructor(inputs, outputs, message = null, version = null) {
        if (inputs.length >= 256) {
            throw new Error(`You can spend max 255 inputs in a single transactions, not ${inputs.length}`);
        }
        if (outputs.length >= 256) {
            throw new Error(`You can have max 255 outputs in a single transactions, not ${outputs.length}`);
        }
        this.inputs = inputs;
        this.outputs = outputs;
        this.message = message;
        this.transaction_type = get_transaction_type_from_message(message);
        if (version === null) {
            if (this.outputs.every(tx_output => tx_output.address_bytes.length === 64)) {
                version = 1;
            } else if (this.outputs.every(tx_output => tx_output.address_bytes.length === 33)) {
                version = 3;
            } else {
                throw new NotImplementedError();
            }
        }
        if (version > 3) {
            throw new NotImplementedError();
        }
        this.version = version;
        this._hex = null;
        this.fees = null;
        this.tx_hash = null;
    }

    hex(full = true) {
        const inputs = this.inputs;
        const outputs = this.outputs;
        let hex_inputs = '';
        let hex_outputs = '';

        for (const tx_input of inputs) {
            hex_inputs += tx_input.tobytes().toString('hex');
        }

        for (const tx_output of outputs) {
            hex_outputs += tx_output.tobytes().toString('hex');
        }

        let tx_hex = '';
        const version = this.version;
        tx_hex += version.toString(16).padStart(2, '0');
        tx_hex += inputs.length.toString(16).padStart(2, '0');
        tx_hex += hex_inputs;
        tx_hex += outputs.length.toString(16).padStart(2, '0');
        tx_hex += hex_outputs;

        if (!full && (version <= 2 || this.message === null)) {
            this._hex = tx_hex;
            return this._hex;
        }

        if (this.message !== null) {
            if (version <= 2) {
                tx_hex += '01';
                tx_hex += this.message.length.toString(16).padStart(2, '0');
            } else {
                tx_hex += '01';
                tx_hex += this.message.length.toString(16).padStart(4, '0');
            }
            tx_hex += this.message.toString('hex');
            if (!full) {
                this._hex = tx_hex;
                return this._hex;
            }
        } else {
            tx_hex += '00';
        }

        const signatures = [];
        for (const tx_input of inputs) {
            const signed = tx_input.get_signature();
            if (!signatures.includes(signed)) {
                signatures.push(signed);
                tx_hex += signed;
            }
        }

        this._hex = tx_hex;
        return this._hex;
    }

    hash() {
        if (this.tx_hash === null) {
            this.tx_hash = sha256(this.hex());
        }
        return this.tx_hash;
    }

    async _check_signature() {
        const tx_hex = this.hex(false);
        const checked_signatures = [];
        for (const tx_input of this.inputs) {
            if (tx_input.signed === null) {
                console.log('not signed');
                return false;
            }
            await tx_input.get_public_key();
            const signature = [tx_input.public_key, tx_input.signed];
            if (checked_signatures.includes(signature)) {
                continue;
            }
            if (!await tx_input.verify(tx_hex)) {
                console.log("signature not valid");
                return false;
            }
            checked_signatures.push(signature);
        }
        return true;
    }

    sign(private_keys = []) {
        for (const private_key of private_keys) {
            for (const input of this.inputs) {
                if (input.private_key === null && (input.public_key || input.transaction)) {
                    const public_key = keys.get_public_key(private_key, CURVE);
                    const input_public_key = input.public_key || input.transaction.outputs[input.index].public_key;
                    if (public_key === input_public_key) {
                        input.private_key = private_key;
                    }
                }
            }
        }
        for (const input of this.inputs) {
            if (input.private_key !== null) {
                input.sign(this.hex(false));
            }
        }
        return this;
    }

    static async from_hex(hexstring, check_signatures = true) {
        const tx_bytes = Buffer.from(hexstring, 'hex');
        const version = tx_bytes.readUInt8(0);
        if (version > 3) {
            throw new NotImplementedError();
        }

        const inputs_count = tx_bytes.readUInt8(1);
        const inputs = [];

        let index = 2;
        for (let i = 0; i < inputs_count; i++) {
            const tx_hex = tx_bytes.slice(index, index + 32).toString('hex');
            index += 32;
            const tx_index = tx_bytes.readUInt8(index);
            index += 1;
            const input_type = tx_bytes.readUInt8(index);
            index += 1;
            inputs.push(new TransactionInput(tx_hex, tx_index, input_type));
        }

        const outputs_count = tx_bytes.readUInt8(index);
        const outputs = [];

        index += 1;
        for (let i = 0; i < outputs_count; i++) {
            const pubkey = tx_bytes.slice(index, index + (version === 1 ? 64 : 33)).toString('hex');
            index += (version === 1 ? 64 : 33);
            const amount_length = tx_bytes.readUInt8(index);
            index += 1;
            const amount = tx_bytes.readUIntBE(index, amount_length) / SMALLEST;
            index += amount_length;
            const transaction_type = tx_bytes.readUInt8(index);
            index += 1;
            outputs.push(new TransactionOutput(bytes_to_string(pubkey), amount, transaction_type));
        }

        const specifier = tx_bytes.readUInt8(index);
        index += 1;

        let message;
        if (specifier === 1) {
            const message_length = version <= 2 ? tx_bytes.readUInt8(index) : tx_bytes.readUInt16BE(index);
            index += version <= 2 ? 1 : 2;
            message = tx_bytes.slice(index, index + message_length);
            index += message_length;
        } else {
            message = null;
            assert(specifier === 0);
        }

        const signatures = [];
        while (true) {
            const signed = [tx_bytes.slice(index, index + 32).toString('hex'), tx_bytes.slice(index + 32, index + 64).toString('hex')];
            index += 64;
            if (signed[0] === '00') {
                break;
            }
            signatures.push(signed);
        }

        if (signatures.length === 1) {
            for (const tx_input of inputs) {
                tx_input.signed = signatures[0];
            }
        } else if (inputs.length === signatures.length) {
            for (let i = 0; i < inputs.length; i++) {
                inputs[i].signed = signatures[i];
            }
        } else {
            if (!check_signatures) {
                return new Transaction(inputs, outputs, message, version);
            }
            const index = {};
            for (const tx_input of inputs) {
                const public_key = point_to_string(await tx_input.get_public_key());
                if (!(public_key in index)) {
                    index[public_key] = [];
                }
                index[public_key].push(tx_input);
            }
            for (let i = 0; i < signatures.length; i++) {
                for (const tx_input of index[Object.keys(index)[i]]) {
                    tx_input.signed = signatures[i];
                }
            }
        }

        return new Transaction(inputs, outputs, message, version);
    }

    __eq__(other) {
        if (other instanceof this.__class__) {
            return this.hex() === other.hex();
        } else {
            return false;
        }
    }

    __ne__(other) {
        return !this.__eq__(other);
    }
}

export { Transaction };
