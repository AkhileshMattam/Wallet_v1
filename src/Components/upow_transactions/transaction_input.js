// TransactionInput.js
import pkg from 'elliptic';
import { Buffer } from 'buffer';
import { Decimal } from 'decimal.js'; // Import Decimal for Decimal arithmetic
import { point_to_string, string_to_point, SMALLEST } from './helpers.js'; // Adjust the import path for helpers.js
// import { InputType } from './constants.js'; // Adjust the import path for constants.js
import { InputType } from './helpers.js';

const { ec: EC } = pkg;
const curve = new EC('p256');

class TransactionInput {
    constructor(input_tx_hash, index, private_key = null, transaction = null, amount = null, public_key = null, input_type = InputType.REGULAR) {
        this.tx_hash = input_tx_hash;
        this.index = index;
        this.private_key = private_key;
        this.transaction = transaction;
        this.transaction_info = null;
        this.amount = amount;
        this.public_key = public_key;
        this.input_type = input_type;

        if (transaction !== null && amount === null) {
            this.get_related_output();
        }
    }

    async get_transaction() {
        return this.transaction;
    }

    async get_transaction_info() {
        if (this.transaction_info === null) {
            throw new Error('Transaction info not available');
        }
        return this.transaction_info;
    }

    async get_related_output() {
        const tx = await this.get_transaction();
        const related_output = tx.outputs[this.index];
        this.amount = related_output.amount;
        return related_output;
    }

    async get_related_input() {
        const tx = await this.get_transaction();
        return tx.inputs[0];
    }

    async get_related_input_info() {
        const tx = await this.get_transaction_info();
        return { address: tx.inputs_addresses[0] };
    }

    async get_related_output_info() {
        const tx = await this.get_transaction_info();
        const related_output = {
            address: tx.outputs_addresses[this.index],
            amount: Decimal(tx.outputs_amounts[this.index]) / SMALLEST
        };
        this.amount = related_output.amount;
        return related_output;
    }

    async get_amount() {
        if (this.amount === null) {
            if (this.transaction !== null) {
                return this.transaction.outputs[this.index].amount;
            } else {
                await this.get_related_output_info();
            }
        }
        return this.amount;
    }

    async get_address() {
        if (this.transaction !== null) {
            return (await this.get_related_output()).address;
        }
        return (await this.get_related_output_info()).address;
    }

    async get_voter_address() {
        if (this.transaction !== null) {
            return (await this.get_related_input()).address;
        }
        return (await this.get_related_input_info()).address;
    }

    sign(tx_hex, private_key = null) {
        private_key = private_key !== null ? private_key : this.private_key;
        const key = curve.keyFromPrivate(private_key);
        const message = Buffer.from(tx_hex, 'hex');
        const signature = key.sign(message);
        this.signed = [signature.r, signature.s];
    }

    async get_public_key() {
        return this.public_key || string_to_point(await this.get_address());
    }

    async get_voter_public_key() {
        return this.public_key || string_to_point(await this.get_voter_address());
    }

    tobytes() {
        const indexBytes = Buffer.alloc(1);
        indexBytes.writeUInt8(this.index, 0);
        return Buffer.concat([Buffer.from(this.tx_hash, 'hex'), indexBytes, Buffer.alloc(1, this.input_type)]);
    }

    get_signature() {
        return this.signed[0].toString(16).padStart(64, '0') + this.signed[1].toString(16).padStart(64, '0');
    }

    async verify(input_tx) {
        try {
            const public_key = await this.get_public_key();
            const key = curve.keyFromPublic(point_to_string(public_key), 'hex');
            const message = typeof input_tx === 'string' ? Buffer.from(input_tx, 'hex') : input_tx;
            return key.verify(message, { r: this.signed[0], s: this.signed[1] });
        } catch (error) {
            return false;
        }
    }

    async verify_revoke_tx(input_tx) {
        try {
            const public_key = await this.get_voter_public_key();
            const key = curve.keyFromPublic(point_to_string(public_key), 'hex');
            const message = typeof input_tx === 'string' ? Buffer.from(input_tx, 'hex') : input_tx;
            return key.verify(message, { r: this.signed[0], s: this.signed[1] });
        } catch (error) {
            return false;
        }
    }

    as_dict() {
        const self_dict = { ...this };
        self_dict.signed = this.signed !== null;
        if ('public_key' in self_dict) {
            self_dict.public_key = point_to_string(self_dict.public_key);
        }
        delete self_dict.transaction;
        delete self_dict.private_key;
        return self_dict;
    }

    equals(other) {
        if (!(other instanceof TransactionInput)) {
            throw new Error('Comparison must be with another TransactionInput instance');
        }
        return this.tx_hash === other.tx_hash && this.index === other.index;
    }
}

export { TransactionInput };
