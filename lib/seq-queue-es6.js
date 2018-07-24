/**
 * Created by zhedong on 2018/7/24.
 */
const EventEmitter = require('events');

const DEFAULT_TIMEOUT = 3000;
const INIT_ID = 0;
const EVENT_CLOSED = 'closed';
const EVENT_DRAINED = 'drained';

const STATUS_IDLE = 0;
const STATUS_BUSY = 1;
const STATUS_CLOSED = 2;
const STATUS_DRAINED = 3;

class SeqQueue extends EventEmitter {
    constructor(timeout) {
        super();

        if(timeout && timeout > 0) {
            this.timeout = timeout;
        } else {
            this.timeout = DEFAULT_TIMEOUT;
        }

        this.status = STATUS_IDLE;
        this.curId = INIT_ID;
        this.queue = [];
    }

    /**
     * Add a task into queue.
     *
     * @param fn new request
     * @param ontimeout callback when task timeout
     * @param timeout timeout for current request. take the global timeout if this is invalid
     * @returns true or false
     */
    push(fn, ontimeout, timeout) {
        if(this.status !== STATUS_IDLE && this.status !== STATUS_BUSY) {
            //ignore invalid status
            return false;
        }

        if(typeof fn !== 'function') {
            throw new Error('fn should be a function.');
        }
        this.queue.push({fn: fn, ontimeout: ontimeout, timeout: timeout});

        if(this.status === STATUS_IDLE) {
            this.status = STATUS_BUSY;
            process.nextTick(()=> {
                this._next(this.curId);
            });
        }
        return true;
    }

    /**
     * Close queue
     *
     * @param {Boolean} force if true will close the queue immediately else will execute the rest task in queue
     */
    close(force) {
        if(this.status !== STATUS_IDLE && this.status !== STATUS_BUSY) {
            //ignore invalid status
            return;
        }

        if(force) {
            this.status = STATUS_DRAINED;
            if(this.timerId) {
                clearTimeout(this.timerId);
                this.timerId = undefined;
            }
            this.emit(EVENT_DRAINED);
        } else {
            this.status = STATUS_CLOSED;
            this.emit(EVENT_CLOSED);
        }
    }

    _next(tid) {
        if(tid !== this.curId || this.status !== STATUS_BUSY && this.status !== STATUS_CLOSED) {
            //ignore invalid next call
            return;
        }

        if(this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = undefined;
        }

        let task = this.queue.shift();
        if(!task) {
            if(this.status === STATUS_BUSY) {
                this.status = STATUS_IDLE;
            }
            return;
        }

        task.id = ++this.curId;
        let timeout = task.timeout > 0 ? task.timeout : this.timeout;
        timeout = timeout > 0 ? timeout : DEFAULT_TIMEOUT;
        this.timerId = setTimeout(()=> {
            process.nextTick(()=> {
                this._next(task.id);
            });
            this.emit('timeout', task);
            if(task.ontimeout) {
                task.ontimeout();
            }
        }, timeout);

        try {
            task.fn({
                done: ()=> {
                    process.nextTick(()=> {
                        this._next(task.id);
                    });
                }
            });
        } catch(err) {
            self.emit('error', err, task);
            process.nextTick(()=> {
                this._next(task.id);
            });
        }
    }
}

module.exports = {
    createQueue: function(timeout) {
        return new SeqQueue(timeout);
    }
}