// import { Decimal } from 'decimal.js';

// export const stringToPoint = (str) => {
//     // Implement the stringToPoint function logic here
//     // For now, returning a placeholder value
//     return new Decimal(0);
// };

// export const roundUpDecimal = (decimalValue) => {
//     return decimalValue.toFixed(2);
// };



// utils.js
import pkg from 'elliptic';
import base58 from 'base-58';
import bigInt from 'big-integer';
import { Decimal } from 'decimal.js';

const { ec: EC } = pkg;

const ENDIAN = "little";
const SMALLEST = 100000000;
const CURVE = new EC('p256');

function log(s) {
    console.info(s);
}

function get_json(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) =>
        (typeof value === 'function') ? value.toString() : value
    ));
}

function timestamp() {
    return Math.floor(new Date().getTime() / 1000);
}

function sha256(message) {
    const hash = crypto.createHash('sha256');
    hash.update(message);
    return hash.digest('hex');
}

function byte_length(i) {
    return Math.ceil(i.toString(2).length / 8);
}

function normalize_block(block) {
    block = { ...block };
    block.address = block.address.trim();
    block.timestamp = Math.floor(new Date(block.timestamp).getTime() / 1000);
    return block;
}

function x_to_y(x, is_odd = false) {
    const { a, b, p } = CURVE;
    const y2 = (x ** 3 + a * x + b) % p;
    const y = Math.sqrt(y2);
    return y % 2 === is_odd ? y : p - y;
}

const AddressFormat = {
    FULL_HEX: 'hex',
    COMPRESSED: 'compressed'
};

const TransactionType = {
    REGULAR: 0,
    STAKE: 1,
    UN_STAKE: 2,
    INODE_REGISTRATION: 3,
    INODE_DE_REGISTRATION: 4,
    VALIDATOR_REGISTRATION: 5,
    VOTE_AS_VALIDATOR: 6,
    VOTE_AS_DELEGATE: 7,
    REVOKE_AS_VALIDATOR: 8,
    REVOKE_AS_DELEGATE: 9
};

const OutputType = {
    REGULAR: 0,
    STAKE: 1,
    UN_STAKE: 2,
    INODE_REGISTRATION: 3,
    VALIDATOR_REGISTRATION: 5,
    VOTE_AS_VALIDATOR: 6,
    VOTE_AS_DELEGATE: 7,
    VALIDATOR_VOTING_POWER: 8,
    DELEGATE_VOTING_POWER: 9
};

const InputType = {
    REGULAR: 0,
    FEES: 1
};

function get_transaction_type_from_message(message) {
    const decoded_message = parseInt(message.toString());
    const transaction_type = TransactionType[decoded_message] || TransactionType.REGULAR;
    return transaction_type;
}

function simple_bytes_to_string(data) {
    return Buffer.from(data).toString('utf-8');
}

function point_to_bytes(point, address_format = AddressFormat.FULL_HEX) {
    if (address_format === AddressFormat.FULL_HEX) {
        return Buffer.concat([point.getX().toArrayLike(Buffer, 'be', 32), point.getY().toArrayLike(Buffer, 'be', 32)]);
    } else if (address_format === AddressFormat.COMPRESSED) {
        const x_bytes = point.getX().toArrayLike(Buffer, 'be', 32);
        const prefix = point.getY().isOdd() ? '03' : '02';
        return Buffer.from(prefix + x_bytes.toString('hex'), 'hex');
    } else {
        throw new Error('Address format not implemented');
    }
}

function bytes_to_point(point_bytes) {
    if (point_bytes.length === 64) {
        const x_bytes = point_bytes.slice(0, 32);
        const y_bytes = point_bytes.slice(32);
        const x = bigInt('0x' + x_bytes.toString('hex'));
        const y = BigInt('0x' + y_bytes.toString('hex'));
        return CURVE.pointFromX(x, y);
    } else if (point_bytes.length === 33) {
        const x_bytes = point_bytes.slice(1);
        const x = BigInt('0x' + x_bytes.toString('hex'));
        const y = x_to_y(x, point_bytes[0] === 0x03);
        return CURVE.pointFromX(x, y);
    } else {
        throw new Error('Invalid point bytes length');
    }
}

function round_up_decimal(decimal, round_up_length = '0.00000001') {
    round_up_length = Decimal(round_up_length);
    if ((decimal * SMALLEST) % 1 !== 0) {
        decimal = decimal.quantize(round_up_length);
    }
    return decimal;
}

function bytes_to_string(point_bytes) {
    const point = bytes_to_point(point_bytes);
    if (point_bytes.length === 64) {
        return point.encode('hex');
    } else if (point_bytes.length === 33) {
        return point.encodeCompressed('hex');
    } else {
        throw new Error('Invalid point bytes length');
    }
}

function string_to_bytes(string) {
    return Buffer.from(string, 'hex');
}

function string_to_point(string) {
    return CURVE.decodePoint(string_to_bytes(string));
}

function point_to_string(point, address_format) {
    if (address_format === AddressFormat.FULL_HEX) {
        return point.encode('hex');
    } else if (address_format === AddressFormat.COMPRESSED) {
        return point.encodeCompressed('hex');
    } else {
        throw new Error('Unsupported address format');
    }
}

export {
    ENDIAN,
    SMALLEST,
    CURVE,
    log,
    get_json,
    timestamp,
    sha256,
    byte_length,
    normalize_block,
    x_to_y,
    AddressFormat,
    TransactionType,
    OutputType,
    InputType,
    get_transaction_type_from_message,
    simple_bytes_to_string,
    point_to_bytes,
    bytes_to_point,
    round_up_decimal,
    bytes_to_string,
    string_to_bytes,
    string_to_point,
    point_to_string
};
