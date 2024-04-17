class NotImplementedError extends Error {
    constructor(message = 'This feature is not implemented yet') {
        super(message);
        this.name = 'NotImplementedError';
    }
}

export { NotImplementedError };
