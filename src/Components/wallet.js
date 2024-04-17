import argparse from 'argparse';
import jsonfile from 'jsonfile';
import axios from 'axios';
import pkg from 'elliptic';

// import { CURVE } from './upow_transactions/constants.js';
import { point_to_string, sha256 } from './upow_transactions/helpers.js';
import Utils from './utils.js';

// const ec = new elliptic.ec(CURVE);
const { ec: EllipticCurve } = pkg;
const ec = new EllipticCurve('p256');
const dirPath = new URL('.', import.meta.url).pathname;
const __dirname = decodeURIComponent(dirPath);
const dbPath = `${__dirname}/key_pair_list.json`;
const walletUtils = new Utils();

const parser = new argparse.ArgumentParser({ description: "UPOW wallet" });
parser.addArgument(
    'command',
    { metavar: 'command', type: String, help: 'action to do with the wallet',
        choices: [
            'createwallet',
            'send',
            'balance',
            'stake',
            'unstake',
            'register_inode',
            'de_register_inode',
            'register_validator',
            'vote',
            'revoke',
        ],
    }
);
parser.addArgument('-to', { metavar: 'recipient', type: String, required: false });
parser.addArgument('-a', { metavar: 'amount', type: String, required: false });
parser.addArgument('-m', { metavar: 'message', type: String, dest: 'message', required: false });
parser.addArgument('-r', { metavar: 'range', type: String, dest: 'range', required: false });
parser.addArgument('-from', { metavar: 'revoke_from', type: String, dest: 'revoke_from', required: false });

const args = parser.parseArgs();
const command = args.command;

async function main() {
    if (command === 'createwallet') {
        const keyList = await readDb();
        const privateKey = ec.genKeyPair().getPrivate();
        const publicKey = ec.genKeyPair().getPublic();
        const address = point_to_string(publicKey);
        keyList.push({ privateKey: privateKey, publicKey: address });
        await writeDb('keys', keyList);

        console.log(`Private key: ${privateKey.toString('hex')}\nAddress: ${address}`);
    } else if (command === 'balance') {
        await showBalance();
    } else if (command === 'send') {
        await sendTransaction();
    } else if (command === 'stake') {
        await stake();
    } else if (command === 'unstake') {
        await unstake();
    } else if (command === 'register_inode') {
        await registerInode();
    } else if (command === 'de_register_inode') {
        await deRegisterInode();
    } else if (command === 'register_validator') {
        await registerValidator();
    } else if (command === 'vote') {
        await vote();
    } else if (command === 'revoke') {
        await revoke();
    }
}

async function readDb() {
    try {
        const data = await jsonfile.readFile(dbPath);
        return data.keys || [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function writeDb(key, value) {
    try {
        const data = await readDb();
        data[key] = value;
        await jsonfile.writeFile(dbPath, { keys: data.keys });
    } catch (error) {
        console.error(error);
    }
}

async function showBalance() {
    const keyPairList = await readDb();
    let totalBalance = 0;
    let totalPendingBalance = 0;
    for (const keyPair of keyPairList) {
        const publicKey = ec.keyFromPrivate(keyPair.privateKey).getPublic();
        const address = point_to_string(publicKey);

        const [balance, pendingBalance, stake, pendingStake, isError] = walletUtils.getBalanceInfo(address);
        if (isError) {
            break;
        }
        totalBalance += balance;
        totalPendingBalance += pendingBalance;

        console.log(
            `Address: ${address}\nPrivate key: ${keyPair.privateKey.toString('hex')}`
            + `\nBalance: ${balance}${pendingBalance !== 0 ? ` (${pendingBalance} pending)` : ''}`
            + `\nStake: ${stake}${pendingStake !== 0 ? ` (${pendingStake} pending)` : ''}`
        );
    }
    console.log(
        `Total Balance: ${totalBalance}${totalPendingBalance !== 0 ? ` (${totalPendingBalance} pending)` : ''}`
    );
}

async function sendTransaction() {
    const recipients = args.recipient.split(',');
    const amounts = args.amount.split(',');
    const message = args.message;

    if (recipients.length > 1 && amounts.length > 1 && recipients.length === amounts.length) {
        const selectedPrivateKey = await selectKey();
        const tx = await walletUtils.createTransactionToSendMultipleWallet(
            selectedPrivateKey, recipients, amounts, stringToBytes(message)
        );
        await pushTx(tx);
    } else {
        const receiver = recipients[0];
        const amount = amounts[0];
        const selectedPrivateKey = await selectKey();
        const tx = await walletUtils.createTransaction(selectedPrivateKey, receiver, amount, stringToBytes(message));
        await pushTx(tx);
    }
}

async function stake() {
    const amount = args.amount;
    const selectedPrivateKey = await selectKey();
    const tx = await walletUtils.createStakeTransaction(selectedPrivateKey, amount);
    await pushTx(tx);
}

async function unstake() {
    const selectedPrivateKey = await selectKey();
    const tx = await walletUtils.createUnstakeTransaction(selectedPrivateKey);
    await pushTx(tx);
}

async function registerInode() {
    const selectedPrivateKey = await selectKey();
    const tx = await walletUtils.createInodeRegistrationTransaction(selectedPrivateKey);
    await pushTx(tx);
}

async function deRegisterInode() {
    const selectedPrivateKey = await selectKey();
    const tx = await walletUtils.createInodeDeRegistrationTransaction(selectedPrivateKey);
    await pushTx(tx);
}

async function registerValidator() {
    const selectedPrivateKey = await selectKey();
    const tx = await walletUtils.createValidatorRegistrationTransaction(selectedPrivateKey);
    await pushTx(tx);
}

async function vote() {
    const votingRange = args.range;
    const recipient = args.recipient;
    const selectedPrivateKey = await selectKey();
    const tx = await walletUtils.createVotingTransaction(selectedPrivateKey, votingRange, recipient);
    await pushTx(tx);
}

async function revoke() {
    const revokeFrom = args.revoke_from;
    const selectedPrivateKey = await selectKey();
    const tx = await walletUtils.createRevokeTransaction(selectedPrivateKey, revokeFrom);
    await pushTx(tx);
}

async function pushTx(tx) {
    try {
        const response = await axios.get(`${walletUtils.NODE_URL}/push_tx`, { params: { tx_hex: tx.toString('hex') }, timeout: 10 });
        const res = response.data;
        if (res.ok) {
            console.log(`Transaction pushed. Transaction hash: ${sha256(tx.toString('hex'))}`);
        } else {
            console.error('Transaction has not been pushed');
        }
    } catch (error) {
        console.error(`Error during request to node: ${error}`);
    }
}

async function selectKey() {
    const keyList = await readDb();

    if (keyList.length === 0) {
        throw new Error('No key. please create key');
    }

    let selectedPrivateKey = null;
    if (keyList.length > 1) {
        console.log('Keys:');
        keyList.forEach((keyPair, index) => {
            console.log(`${index}: ${keyPair.publicKey}`);
        });
        try {
            const userInput = prompt('Select key: ');
            const index = parseInt(userInput, 10);
            if (index >= keyList.length) {
                throw new Error('Invalid input. Please enter a correct key number.');
            }
            selectedPrivateKey = keyList[index].privateKey;
        } catch (error) {
            throw new Error('Invalid input. Please enter a valid integer.');
        }
    } else {
        selectedPrivateKey = keyList[0].privateKey;
    }
    return selectedPrivateKey;
}

function stringToBytes(string) {
    if (string === null) {
        return null;
    }
    try {
        return Buffer.from(string, 'hex');
    } catch (error) {
        return Buffer.from(string, 'utf-8');
    }
}

main().catch((error) => {
    console.error(error);
});
