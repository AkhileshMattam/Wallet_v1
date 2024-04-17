import pkg from 'elliptic';
import { Decimal } from 'decimal.js'
import WalletRepository from './repository.js';
// import { CURVE, MAX_INODES } from './upow_transactions/constants.js';
import { MAX_INODES } from './upow_transactions/constants.js';
import { TransactionType, OutputType, point_to_string } from './upow_transactions/helpers.js';
import { TransactionOutput } from './upow_transactions/transaction_output.js'
import { Transaction } from './upow_transactions/transaction.js';


// const ec = new EC(CURVE);
const { ec: EllipticCurve } = pkg;
const ec = new EllipticCurve('p256');


class Utils {
    NODE_URL = "https://api.upow.ai";

    constructor() {
        this.repo = new WalletRepository(this.NODE_URL);
    }

    getBalanceInfo(address) {
        return this.repo.getBalanceInfo(address);
    }

    async createTransaction(
        privateKey,
        receivingAddress,
        amount,
        message = null,
        sendBackAddress = null
    ) {
        amount = new Decimal(amount);
        const inputs = [];
        const senderAddress = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        if (!sendBackAddress) {
            sendBackAddress = senderAddress;
        }

        const rJson = await this.repo.getAddressInfo(senderAddress);
        const addressInputs = this.repo.getAddressInputFromJson(rJson, senderAddress);
        inputs.push(...addressInputs);

        if (!inputs.length) {
            throw new Error("No spendable outputs");
        }

        if (inputs.reduce((sum, input) => sum + input.amount, 0) < amount) {
            throw new Error("Error: You don't have enough funds");
        }

        const transactionInputs = this.selectTransactionInput(inputs, amount);

        const transactionAmount = transactionInputs.reduce((sum, input) => sum + input.amount, 0);

        const transaction = new Transaction(
            transactionInputs,
            [new TransactionOutput(receivingAddress, amount, message)]
        );

        if (transactionAmount > amount) {
            transaction.outputs.push(new TransactionOutput(sendBackAddress, transactionAmount - amount));
        }

        transaction.sign(privateKey);

        return transaction;
    }

    async createTransactionToSendMultipleWallet(
        privateKey,
        receivingAddresses,
        amounts,
        message = null,
        sendBackAddress = null
    ) {
        if (receivingAddresses.length !== amounts.length) {
            throw new Error("Receiving addresses length is different from amounts length");
        }

        const totalAmount = amounts.reduce((sum, amount) => sum + new Decimal(amount), 0);
        const inputs = [];
        const senderAddress = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        if (!sendBackAddress) {
            sendBackAddress = senderAddress;
        }

        const rJson = await this.repo.getAddressInfo(senderAddress);
        const addressInputs = this.repo.getAddressInputFromJson(rJson, senderAddress);
        inputs.push(...addressInputs);

        if (!inputs.length) {
            throw new Error("No spendable outputs");
        }

        const totalInputAmount = inputs.reduce((sum, input) => sum + input.amount, 0);

        if (totalInputAmount < totalAmount) {
            throw new Error("Error: You don't have enough funds");
        }

        const transactionInputs = [];
        const transactionOutputs = [];

        let inputAmount = new Decimal(0);
        for (const txInput of inputs.sort((a, b) => b.amount - a.amount)) {
            transactionInputs.push(txInput);
            inputAmount = inputAmount.plus(txInput.amount);
            if (inputAmount >= totalAmount) {
                break;
            }
        }

        for (let i = 0; i < receivingAddresses.length; i++) {
            transactionOutputs.push(new TransactionOutput(receivingAddresses[i], amounts[i]));
        }

        const changeAmount = inputAmount.minus(totalAmount);
        if (changeAmount > 0) {
            transactionOutputs.push(new TransactionOutput(sendBackAddress, changeAmount));
        }

        const transaction = new Transaction(transactionInputs, transactionOutputs, message);
        transaction.sign(privateKey);

        return transaction;
    }

    async createStakeTransaction(privateKey, amount, sendBackAddress = null) {
        amount = new Decimal(amount);
        const inputs = [];
        const senderAddress = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        if (!sendBackAddress) {
            sendBackAddress = senderAddress;
        }

        const resultJson = await this.repo.getAddressInfo(senderAddress, {
            stakeOutputs: true,
            delegateUnspentVotes: true,
            delegateSpentVotes: true,
        });

        inputs.push(...this.repo.getAddressInputFromJson(resultJson, senderAddress));

        if (!inputs.length) {
            throw new Error("No spendable outputs");
        }

        if (inputs.reduce((sum, input) => sum + input.amount, 0) < amount) {
            throw new Error("Error: You don't have enough funds");
        }

        const stakeInputs = this.repo.getStakeInputFromJson(resultJson, senderAddress, { checkPendingTxs: false });
        if (stakeInputs.length) {
            throw new Error("Already staked");
        }

        const transactionInputs = [];

        for (const txInput of inputs.sort((a, b) => a.amount - b.amount)) {
            if (txInput.amount >= amount) {
                transactionInputs.push(txInput);
                break;
            }
        }

        for (const txInput of inputs.sort((a, b) => b.amount - a.amount)) {
            if (transactionInputs.reduce((sum, input) => sum + input.amount, 0) >= amount) {
                break;
            }
            transactionInputs.push(txInput);
        }

        const transactionAmount = transactionInputs.reduce((sum, input) => sum + input.amount, 0);

        const transaction = new Transaction(
            transactionInputs,
            [new TransactionOutput(senderAddress, amount, OutputType.STAKE)]
        );

        if (transactionAmount > amount) {
            transaction.outputs.push(new TransactionOutput(sendBackAddress, transactionAmount - amount));
        }

        if (!this.repo.getDelegatesAllPower(resultJson)) {
            const votingPower = new Decimal(10);
            transaction.outputs.push(new TransactionOutput(senderAddress, votingPower, OutputType.DELEGATE_VOTING_POWER));
        }

        transaction.sign(privateKey);

        return transaction;
    }

    async createUnstakeTransaction(privateKey) {
        const senderAddress = point_to_string(ec.keyFromPrivate(privateKey).getPublic());
        const resultJson = await this.repo.getAddressInfo(senderAddress, {
            stakeOutputs: true,
            delegateSpentVotes: true,
        });
        const stakeInputs = this.repo.getStakeInputFromJson(resultJson, senderAddress);

        if (!stakeInputs.length) {
            throw new Error("Error: There is nothing staked");
        }

        const amount = stakeInputs[0].amount;

        if (this.repo.getDelegateSpentVotesFromJson(resultJson, { checkPendingTxs: false })) {
            throw new Error("Kindly release the votes.");
        }

        const pendingVoteTx = this.repo.getPendingVoteAsDelegateTransactionFromJson(senderAddress, resultJson);
        if (pendingVoteTx) {
            throw new Error('Kindly release the votes. Vote transaction is in pending');
        }

        const transaction = new Transaction([stakeInputs[0]], [new TransactionOutput(senderAddress, amount, OutputType.UN_STAKE)]);
        transaction.sign(privateKey);
        return transaction;
    }

    async createInodeRegistrationTransaction(privateKey) {
        const amount = new Decimal(1000);
        const inputs = [];
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        const resultJson = await this.repo.getAddressInfo(address, {
            stakeOutputs: true,
            addressState: true,
        });

        inputs.push(...this.repo.getAddressInputFromJson(resultJson, address));

        if (!inputs.length) {
            throw new Error("No spendable outputs");
        }

        if (inputs.reduce((sum, input) => sum + input.amount, 0) < amount) {
            throw new Error("Error: You don't have enough funds");
        }

        const stakeInputs = this.repo.getStakeInputFromJson(resultJson, address);
        if (!stakeInputs.length) {
            throw new Error("You are not a delegate. Become a delegate by staking.");
        }

        if (resultJson.is_inode) {
            throw new Error("This address is already registered as inode.");
        }

        if (resultJson.is_validator) {
            throw new Error("This address is registered as validator and a validator cannot be an inode.");
        }

        const inodeAddresses = this.repo.getDobbyInfo();
        if (inodeAddresses.length >= MAX_INODES) {
            throw new Error(`${MAX_INODES} inodes are already registered.`);
        }

        const transactionInputs = [];

        for (const txInput of inputs.sort((a, b) => a.amount - b.amount)) {
            if (txInput.amount >= amount) {
                transactionInputs.push(txInput);
                break;
            }
        }

        for (const txInput of inputs.sort((a, b) => b.amount - a.amount)) {
            if (transactionInputs.reduce((sum, input) => sum + input.amount, 0) >= amount) {
                break;
            }
            transactionInputs.push(txInput);
        }

        const transactionAmount = transactionInputs.reduce((sum, input) => sum + input.amount, 0);

        const transaction = new Transaction(
            transactionInputs,
            [new TransactionOutput(address, amount, OutputType.INODE_REGISTRATION)]
        );

        if (transactionAmount > amount) {
            transaction.outputs.push(new TransactionOutput(address, transactionAmount - amount));
        }

        transaction.sign(privateKey);
        return transaction;
    }

    async createInodeDeRegistrationTransaction(privateKey) {
        const inputs = [];
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        const resultJson = await this.repo.getAddressInfo(address, {
            inodeRegistrationOutputs: true,
        });

        inputs.push(...this.repo.getInodeRegistrationInputFromJson(resultJson, address));

        if (!inputs.length) {
            throw new Error("This address is not registered as an inode.");
        }

        const activeInodeAddresses = this.repo.getDobbyInfo();
        const is_inode_active = activeInodeAddresses.some(entry => entry.wallet === address);
        if (is_inode_active) {
            throw new Error("This address is an active inode. Cannot de-register.");
        }

        const amount = inputs[0].amount;

        const message = this.stringToBytes(String(TransactionType.INODE_DE_REGISTRATION.value));
        const transaction = new Transaction(inputs, [new TransactionOutput(address, amount)], message);

        transaction.sign(privateKey);
        return transaction;
    }

    async createValidatorRegistrationTransaction(privateKey) {
        const amount = new Decimal(100);
        const inputs = [];
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        const resultJson = await this.repo.getAddressInfo(address, {
            stakeOutputs: true,
            addressState: true,
        });

        inputs.push(...this.repo.getAddressInputFromJson(resultJson, address));

        if (!inputs.length) {
            throw new Error("No spendable outputs");
        }

        if (inputs.reduce((sum, input) => sum + input.amount, 0) < amount) {
            throw new Error("Error: You don't have enough funds");
        }

        const stakeInputs = this.repo.getStakeInputFromJson(resultJson, address);
        if (!stakeInputs.length) {
            throw new Error("You are not a delegate. Become a delegate by staking.");
        }

        if (resultJson.is_validator) {
            throw new Error("This address is already registered as validator.");
        }

        if (resultJson.is_inode) {
            throw new Error("This address is registered as inode and an inode cannot be a validator.");
        }

        const transactionInputs = this.selectTransactionInput(inputs, amount);

        const transactionAmount = transactionInputs.reduce((sum, input) => sum + input.amount, 0);

        const message = this.stringToBytes(String(TransactionType.VALIDATOR_REGISTRATION.value));
        const transaction = new Transaction(
            transactionInputs,
            [new TransactionOutput(address, amount, OutputType.VALIDATOR_REGISTRATION)],
            message
        );

        const votingPower = new Decimal(10);
        transaction.outputs.push(new TransactionOutput(address, votingPower, OutputType.VALIDATOR_VOTING_POWER));

        if (transactionAmount > amount) {
            transaction.outputs.push(new TransactionOutput(address, transactionAmount - amount));
        }

        transaction.sign(privateKey);
        return transaction;
    }

    async createVotingTransaction(privateKey, voteRange, voteReceivingAddress) {
        if (isNaN(voteRange) || voteRange > 10 || voteRange <= 0) {
            throw new Error("Invalid voting range");
        }

        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        const resultJson = await this.repo.getAddressInfo(address, {
            stakeOutputs: true,
            addressState: true,
            validatorUnspentVotes: true,
            delegateUnspentVotes: true,
        });

        const stakeInputs = this.repo.getStakeInputFromJson(resultJson, address);

        if (resultJson.is_inode) {
            throw new Error("This address is registered as inode. Cannot vote.");
        }

        const isValidatorRegistered = resultJson.is_validator;
        if (isValidatorRegistered) {
            return await this.voteAsValidator(privateKey, voteRange, voteReceivingAddress, resultJson);
        } else if (stakeInputs.length) {
            return await this.voteAsDelegate(privateKey, voteRange, voteReceivingAddress, resultJson);
        } else {
            throw new Error("Not eligible to vote");
        }
    }

    async voteAsValidator(privateKey, voteRange, voteReceivingAddress, resultJson) {
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());
        voteRange = new Decimal(voteRange);
        const inputs = [];

        inputs.push(...this.repo.getValidatorUnspentVotesFromJson(resultJson, address));

        if (!inputs.length) {
            throw new Error("No voting outputs");
        }

        if (inputs.reduce((sum, input) => sum + input.amount, 0) < voteRange) {
            throw new Error("Error: You don't have enough voting power left. Kindly revoke some voting power.");
        }

        const transactionInputs = this.selectTransactionInput(inputs, voteRange);

        const transactionVoteRange = transactionInputs.reduce((sum, input) => sum + input.amount, 0);

        const message = this.stringToBytes(String(TransactionType.VOTE_AS_VALIDATOR.value));
        const transaction = new Transaction(
            transactionInputs,
            [new TransactionOutput(voteReceivingAddress, voteRange, OutputType.VOTE_AS_VALIDATOR)],
            message
        );

        if (transactionVoteRange > voteRange) {
            transaction.outputs.push(new TransactionOutput(address, transactionVoteRange - voteRange, OutputType.VALIDATOR_VOTING_POWER));
        }

        transaction.sign(privateKey);
        return transaction;
    }

    async voteAsDelegate(privateKey, voteRange, voteReceivingAddress, resultJson) {
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        voteRange = new Decimal(voteRange);
        const inputs = [];

        inputs.push(...this.repo.getDelegateUnspentVotesFromJson(resultJson, address));

        if (!inputs.length) {
            throw new Error("No voting outputs");
        }

        if (inputs.reduce((sum, input) => sum + input.amount, 0) < voteRange) {
            throw new Error("Error: You don't have enough voting power left. Kindly release some voting power.");
        }

        const transactionInputs = this.selectTransactionInput(inputs, voteRange);

        const transactionVoteRange = transactionInputs.reduce((sum, input) => sum + input.amount, 0);

        const message = this.stringToBytes(String(TransactionType.VOTE_AS_DELEGATE.value));
        const transaction = new Transaction(
            transactionInputs,
            [new TransactionOutput(voteReceivingAddress, voteRange, OutputType.VOTE_AS_DELEGATE)],
            message
        );

        if (transactionVoteRange > voteRange) {
            transaction.outputs.push(new TransactionOutput(address, transactionVoteRange - voteRange, OutputType.DELEGATE_VOTING_POWER));
        }

        transaction.sign(privateKey);
        return transaction;
    }

    async createRevokeTransaction(privateKey, revokeFromAddress) {
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());
        const resultJson = await this.repo.getAddressInfo(address, {
            stakeOutputs: true,
            addressState: true,
        });

        const isValidatorRegistered = resultJson.is_validator;
        if (isValidatorRegistered) {
            return await this.revokeVoteAsValidator(privateKey, revokeFromAddress, resultJson);
        } else {
            return await this.revokeVoteAsDelegate(privateKey, revokeFromAddress, resultJson);
        }
    }

    async revokeVoteAsValidator(privateKey, inodeAddress, addressInfo) {
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());
        const inodeBallot = this.repo.getValidatorsInfo(inodeAddress);
        const inodeBallotInputs = this.repo.getValidatorBallotInputByAddressFromJson(inodeBallot, address, inodeAddress,
                                                                                    addressInfo.pending_spent_outputs);

        if (!inodeBallotInputs.length) {
            throw new Error('You have not voted.');
        }

        const message = this.stringToBytes(String(TransactionType.REVOKE_AS_VALIDATOR.value));
        const sumOfVotes = inodeBallotInputs.reduce((sum, input) => sum + input.amount, 0);
        const transaction = new Transaction(
            inodeBallotInputs,
            [new TransactionOutput(address, sumOfVotes, OutputType.VALIDATOR_VOTING_POWER)],
            message
        );

        transaction.sign(privateKey);
        return transaction;
    }

    async revokeVoteAsDelegate(privateKey, validatorAddress, addressInfo) {
        const address = point_to_string(ec.keyFromPrivate(privateKey).getPublic());

        const validatorBallot = this.repo.getDelegatesInfo(validatorAddress);
        const validatorBallotInputs = this.repo.getValidatorBallotInputByAddressFromJson(validatorBallot, address,
                                                                                            validatorAddress,
                                                                                            addressInfo.pending_spent_outputs);

        if (!validatorBallotInputs.length) {
            throw new Error('You have not voted.');
        }

        const message = this.stringToBytes(String(TransactionType.REVOKE_AS_DELEGATE.value));
        const sumOfVotes = validatorBallotInputs.reduce((sum, input) => sum + input.amount, 0);
        const transaction = new Transaction(
            validatorBallotInputs,
            [new TransactionOutput(address, sumOfVotes, OutputType.DELEGATE_VOTING_POWER)],
            message
        );

        transaction.sign(privateKey);
        return transaction;
    }

    selectTransactionInput(inputs, amount) {
        const transactionInputs = [];
        for (const txInput of inputs.sort((a, b) => a.amount - b.amount)) {
            if (txInput.amount >= amount) {
                transactionInputs.push(txInput);
                break;
            }
        }

        for (const txInput of inputs.sort((a, b) => b.amount - a.amount)) {
            if (transactionInputs.reduce((sum, input) => sum + input.amount, 0) >= amount) {
                break;
            }
            transactionInputs.push(txInput);
        }
        return transactionInputs;
    }

    stringToBytes(string) {
        if (!string) {
            return null;
        }
        try {
            return Buffer.from(string, 'hex');
        } catch (error) {
            return Buffer.from(string, 'utf-8');
        }
    }
}

export default Utils;
