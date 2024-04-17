import axios from 'axios';
import { string_to_point, round_up_decimal } from './upow_transactions/helpers.js';
import { TransactionInput } from './upow_transactions/transaction_input.js';
import { Decimal } from 'decimal.js';

class WalletRepository {
    constructor(nodeUrl) {
        this.nodeUrl = nodeUrl;
    }

    async getAddressInfo(
        address,
        stakeOutputs = false,
        delegateSpentVotes = false,
        delegateUnspentVotes = false,
        addressState = false,
        inodeRegistrationOutputs = false,
        validatorUnspentVotes = false
    ) {
        try {
            const response = await axios.get(`${this.nodeUrl}/get_address_info`, {
                params: {
                    address,
                    transactions_count_limit: 0,
                    show_pending: true,
                    stake_outputs: stakeOutputs,
                    delegate_spent_votes: delegateSpentVotes,
                    delegate_unspent_votes: delegateUnspentVotes,
                    address_state: addressState,
                    inode_registration_outputs: inodeRegistrationOutputs,
                    validator_unspent_votes: validatorUnspentVotes,
                },
            });
            return response.data.result;
        } catch (error) {
            throw new Error(error.response ? error.response.data.error : error.message);
        }
    }

    async getDobbyInfo() {
        try {
            const response = await axios.get(`${this.nodeUrl}/dobby_info`);
            return response.data.result;
        } catch (error) {
            throw new Error(error.response ? error.response.data.error : error.message);
        }
    }

    async getValidatorsInfo(inode = null) {
        try {
            const params = inode ? { inode } : {};
            const response = await axios.get(`${this.nodeUrl}/get_validators_info`, { params });
            return response.data;
        } catch (error) {
            throw new Error(error.response ? error.response.data.error : error.message);
        }
    }

    getInodeBallotInputByAddressFromJson(json, address, inodeAddress, pendingSpentOutputs = [], checkPendingTxs = true) {
        if (pendingSpentOutputs === null) {
            pendingSpentOutputs = [];
        }
        pendingSpentOutputs = checkPendingTxs ? pendingSpentOutputs.map(output => [output.tx_hash, output.index]) : [];
        const inodeBallotInputs = [];
        json.forEach(validatorInfo => {
            if (validatorInfo.validator === address) {
                validatorInfo.vote.forEach(validatorVotedFor => {
                    if (pendingSpentOutputs.some(output => output[0] === validatorVotedFor.tx_hash && output[1] === validatorVotedFor.index)) {
                        return;
                    }
                    if (validatorVotedFor.wallet !== inodeAddress) {
                        return;
                    }
                    const txInput = new TransactionInput(validatorVotedFor.tx_hash, validatorVotedFor.index);
                    txInput.amount = Decimal(validatorVotedFor.vote_count.toString());
                    txInput.publicKey = string_to_point(address);
                    inodeBallotInputs.push(txInput);
                });
            }
        });
        return inodeBallotInputs;
    }

    async getDelegatesInfo(validator = null) {
        try {
            const params = validator ? { validator } : {};
            const response = await axios.get(`${this.nodeUrl}/get_delegates_info`, { params });
            return response.data;
        } catch (error) {
            throw new Error(error.response ? error.response.data.error : error.message);
        }
    }

    getValidatorBallotInputByAddressFromJson(json, address, validatorAddress, pendingSpentOutputs = [], checkPendingTxs = true) {
        if (pendingSpentOutputs === null) {
            pendingSpentOutputs = [];
        }
        pendingSpentOutputs = checkPendingTxs ? pendingSpentOutputs.map(output => [output.tx_hash, output.index]) : [];
        const validatorBallotInputs = [];
        json.forEach(delegateInfo => {
            if (delegateInfo.delegate === address) {
                delegateInfo.vote.forEach(delegateVotedFor => {
                    if (pendingSpentOutputs.some(output => output[0] === delegateVotedFor.tx_hash && output[1] === delegateVotedFor.index)) {
                        return;
                    }
                    if (delegateVotedFor.wallet !== validatorAddress) {
                        return;
                    }
                    const txInput = new TransactionInput(delegateVotedFor.tx_hash, delegateVotedFor.index);
                    txInput.amount = Decimal(delegateVotedFor.vote_count.toString());
                    txInput.publicKey = string_to_point(address);
                    validatorBallotInputs.push(txInput);
                });
            }
        });
        return validatorBallotInputs;
    }

    getAddressInputFromJson(result, address) {
        const pendingSpentOutputs = result.pending_spent_outputs.map(output => [output.tx_hash, output.index]);
        const txInputs = [];
        result.spendable_outputs.forEach(spendableTxInput => {
            if (pendingSpentOutputs.some(output => output[0] === spendableTxInput.tx_hash && output[1] === spendableTxInput.index)) {
                return;
            }
            const txInput = new TransactionInput(spendableTxInput.tx_hash, spendableTxInput.index);
            txInput.amount = Decimal(spendableTxInput.amount.toString());
            txInput.publicKey = string_to_point(address);
            txInputs.push(txInput);
        });
        return txInputs;
    }

    getStakeInputFromJson(result, address, checkPendingTxs = true) {
        const pendingSpentOutputs = checkPendingTxs ? result.pending_spent_outputs.map(output => [output.tx_hash, output.index]) : [];
        const stakeTxInput = [];
        result.stake_outputs.forEach(stakeTxOutput => {
            if (pendingSpentOutputs.some(output => output[0] === stakeTxOutput.tx_hash && output[1] === stakeTxOutput.index) || !stakeTxOutput.amount) {
                return;
            }
            const txInput = new TransactionInput(stakeTxOutput.tx_hash, stakeTxOutput.index);
            txInput.amount = Decimal(stakeTxOutput.amount.toString());
            txInput.publicKey = string_to_point(address);
            stakeTxInput.push(txInput);
        });
        return stakeTxInput;
    }

    getInodeRegistrationInputFromJson(json, address) {
        const pendingSpentOutputs = json.pending_spent_outputs.map(output => [output.tx_hash, output.index]);
        const inodeRegistrationInput = [];
        json.inode_registration_outputs.forEach(inodeRegOutput => {
            if (pendingSpentOutputs.some(output => output[0] === inodeRegOutput.tx_hash && output[1] === inodeRegOutput.index)) {
                return;
            }
            const txInput = new TransactionInput(inodeRegOutput.tx_hash, inodeRegOutput.index);
            txInput.amount = Decimal(inodeRegOutput.amount.toString());
            txInput.publicKey = string_to_point(address);
            inodeRegistrationInput.push(txInput);
        });
        return inodeRegistrationInput;
    }

    getDelegateSpentVotesFromJson(json, checkPendingTxs = true) {
        const pendingSpentOutputs = checkPendingTxs ? json.pending_spent_outputs.map(output => [output.tx_hash, output.index]) : [];
        const delegateVoteTxInput = [];
        json.delegate_spent_votes.forEach(delegateSpentVote => {
            if (pendingSpentOutputs.some(output => output[0] === delegateSpentVote.tx_hash && output[1] === delegateSpentVote.index) || !delegateSpentVote.amount) {
                return;
            }
            const txInput = new TransactionInput(delegateSpentVote.tx_hash, delegateSpentVote.index);
            txInput.amount = Decimal(delegateSpentVote.amount.toString());
            delegateVoteTxInput.push(txInput);
        });
        return delegateVoteTxInput;
    }

    getDelegateUnspentVotesFromJson(json, address = null, checkPendingTxs = true) {
        const pendingSpentOutputs = checkPendingTxs ? json.pending_spent_outputs.map(output => [output.tx_hash, output.index]) : [];
        const delegateVoteTxInput = [];
        json.delegate_unspent_votes.forEach(delegateUnspentVotes => {
            if (pendingSpentOutputs.some(output => output[0] === delegateUnspentVotes.tx_hash && output[1] === delegateUnspentVotes.index) || !delegateUnspentVotes.amount) {
                return;
            }
            const txInput = new TransactionInput(delegateUnspentVotes.tx_hash, delegateUnspentVotes.index);
            txInput.amount = Decimal(delegateUnspentVotes.amount.toString());
            txInput.publicKey = string_to_point(address);
            delegateVoteTxInput.push(txInput);
        });
        return delegateVoteTxInput;
    }

    getValidatorUnspentVotesFromJson(json, address, checkPendingTxs = true) {
        const pendingSpentOutputs = checkPendingTxs ? json.pending_spent_outputs.map(output => [output.tx_hash, output.index]) : [];
        const validatorVoteTxInput = [];
        json.validator_unspent_votes.forEach(validatorUnspentVotes => {
            if (pendingSpentOutputs.some(output => output[0] === validatorUnspentVotes.tx_hash && output[1] === validatorUnspentVotes.index) || !validatorUnspentVotes.amount) {
                return;
            }
            const txInput = new TransactionInput(validatorUnspentVotes.tx_hash, validatorUnspentVotes.index);
            txInput.amount = Decimal(validatorUnspentVotes.amount.toString());
            txInput.publicKey = string_to_point(address);
            validatorVoteTxInput.push(txInput);
        });
        return validatorVoteTxInput;
    }

    getDelegatesAllPower(json) {
        const delegatesUnspentVotes = this.getDelegateUnspentVotesFromJson(json, false);
        const delegatesSpentVotes = this.getDelegateSpentVotesFromJson(json, false);
        delegatesUnspentVotes.push(...delegatesSpentVotes);
        const totalPower = delegatesUnspentVotes.reduce((acc, delegateVotes) => acc + Number(delegateVotes.amount), 0);
        if (totalPower > 10) {
            throw new Error('Total delegate power exceeds limit of 10');
        }
        return delegatesUnspentVotes;
    }

    getPendingVoteAsDelegateTransactionFromJson(address, json) {
        const pendingTransactions = json.pending_transactions;
        const pendingVoteAsDelegateTransaction = [];
        pendingTransactions.forEach(tx => {
            if (tx.transaction_type === 'VOTE_AS_DELEGATE' && tx.inputs[0].address === address) {
                pendingVoteAsDelegateTransaction.push(tx);
            }
        });
        return pendingVoteAsDelegateTransaction;
    }

    async getBalanceInfo(address) {
        try {
            const response = await axios.get(`${this.nodeUrl}/get_address_info`, {
                params: { address, show_pending: true },
            });
            const { result } = response.data;

            if (!response.data.ok) {
                throw new Error(response.data.error);
            }

            const spendableOutputs = result.spendable_outputs;
            const spendableHashes = new Set(spendableOutputs.map(output => output.tx_hash));

            let totalBalance = Decimal(result.balance.toString());
            let pendingBalance = Decimal('0');
            let stakeBalance = Decimal(result.stake.toString());
            let pendingStakeBalance = Decimal('0');

            result.pending_transactions.forEach(tx => {
                tx.inputs.forEach(input => {
                    if (input.address === address && spendableHashes.has(input.tx_hash)) {
                        const inputAmount = Decimal(input.amount.toString());
                        if (tx.outputs.some(output => output.type === 'UN_STAKE')) {
                            pendingBalance = pendingBalance.add(inputAmount);
                        } else if (tx.transaction_type === 'REGULAR') {
                            pendingBalance = pendingBalance.sub(inputAmount);
                        }
                    }
                });

                tx.outputs.forEach(output => {
                    if (output.address === address) {
                        const outputAmount = Decimal(output.amount.toString());
                        if (output.type === 'STAKE') {
                            pendingStakeBalance = pendingStakeBalance.add(outputAmount);
                        } else if (output.type === 'UN_STAKE') {
                            pendingStakeBalance = pendingStakeBalance.sub(outputAmount);
                        } else if (output.type === 'REGULAR') {
                            pendingBalance = pendingBalance.add(outputAmount);
                        }
                    }
                });
            });

            totalBalance = round_up_decimal(totalBalance);
            pendingBalance = round_up_decimal(pendingBalance);
            stakeBalance = round_up_decimal(stakeBalance);
            pendingStakeBalance = round_up_decimal(pendingStakeBalance);

            return [totalBalance, pendingBalance, stakeBalance, pendingStakeBalance, false];
        } catch (error) {
            throw new Error(`Error fetching balance: ${error.message}`);
        }
    }
}

export default WalletRepository;
