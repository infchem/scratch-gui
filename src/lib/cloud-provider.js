import log from './log.js';


class CloudProvider {
    /**
     * A cloud data provider which creates and manages a web socket connection
     * to the Scratch cloud data server. This provider is responsible for
     * interfacing with the VM's cloud io device.
     * @param {string} cloudHost The url for the cloud data server
     * @param {VirtualMachine} vm The Scratch virtual machine to interface with
     * @param {string} username The username to associate cloud data updates with
     * @param {string} projectId The id associated with the project containing
     * cloud data.
     */
    constructor (cloudHost, vm, username, projectId) {
        this.vm = vm;
        this.username = username;
        this.projectId = projectId;

        // Open a websocket connection to the clouddata server
        this.openConnection(cloudHost);
    }

    /**
     * Open a new websocket connection to the clouddata server.
     * @param {string} cloudHost The cloud data server to connect to.
     */
    openConnection (cloudHost) {
        if (window.WebSocket === null) {
            log.warn('Websocket support is not available in this browser');
            this.connection = null;
            return;
        }

        this.connection = new WebSocket((location.protocol === 'http:' ? 'ws://' : 'wss://') + cloudHost);

        this.connection.onerror = this.onError.bind(this);
        this.connection.onmessage = this.onMessage.bind(this);
        this.connection.onopen = this.onOpen.bind(this);
        this.connection.onclose = this.onClose.bind(this);
    }

    onError (event) {
        log.error(`Websocket connection error: ${JSON.stringify(event)}`);
        // TODO Add re-connection attempt logic here
        this.clear();
    }

    onMessage (event) {
        const messageString = event.data;
        log.info(`Received websocket message: ${messageString}`);
        // Multiple commands can be received, newline separated
        messageString.split('\n').forEach(message => {
            const parsedData = this.parseMessage(JSON.parse(message));
            this.vm.postIOData('cloud', parsedData);
        });
    }

    onOpen () {
        this.writeToServer('handshake');
        log.info(`Successfully connected to clouddata server.`);
    }

    onClose () {
        log.info(`Closed connection to websocket`);
    }

    parseMessage (message) {
        const varData = {};
        switch (message.method) {
        case 'ack': {
            varData.varCreate = {
                name: message.name
            };
            break;
        }
        case 'set': {
            varData.varUpdate = {
                name: message.name,
                value: message.value
            };
            break;
        }
        }
        return varData;
    }

    /**
     * Format and send a message to the cloud data server.
     * @param {string} methodName The message method, indicating the action to perform.
     * @param {string} dataName The name of the cloud variable this message pertains to
     * @param {string | number} dataValue The value to set the cloud variable to
     * @param {number} dataIndex The index of the item to update (for cloud lists)
     * @param {string} dataNewName The new name for the cloud variable (if renaming)
     */
    writeToServer (methodName, dataName, dataValue, dataIndex, dataNewName) {
        const msg = {};
        msg.method = methodName;
        msg.user = this.username;
        msg.project_id = this.projectId;

        // Optional string params can use simple falsey undefined check
        if (dataName) msg.name = dataName;
        if (dataNewName) msg.new_name = dataNewName;

        // Optional number params need different undefined check
        if (typeof dataValue !== 'undefined') msg.value = dataValue;
        if (typeof dataValue !== 'undefined') msg.index = dataIndex;

        const dataToWrite = JSON.stringify(msg);
        this.sendCloudData(dataToWrite);
    }

    /**
     * Send a formatted message to the cloud data server.
     * @param {string} data The formatted message to send.
     */
    sendCloudData (data) {
        this.connection.send(`${data}\n`);
        log.info(`Sent message to clouddata server: ${data}`);
    }

    /**
     * Provides an API for the VM's cloud IO device to create
     * a new cloud variable on the server.
     * @param {string} name The name of the variable to create
     * @param {string | number} value The value of the new cloud variable.
     */
    createVariable (name, value) {
        this.writeToServer('create', name, value);
    }

    /**
     * Provides an API for the VM's cloud IO device to update
     * a cloud variable on the server.
     * @param {string} name The name of the variable to update
     * @param {string | number} value The new value for the variable
     */
    updateVariable (name, value) {
        this.writeToServer('set', name, value);
    }

    /**
     * Closes the connection to the web socket and clears the cloud
     * provider of references related to the cloud data project.
     */
    requestCloseConnection () {
        if (this.connection &&
            this.connection.readyState !== WebSocket.CLOSING &&
            this.connection.readyState !== WebSocket.CLOSED) {

            this.connection.close();
        }
        this.clear();
    }

    /**
     * Clear this provider of references related to the project
     * and current state.
     */
    clear () {
        this.connection = null;
        this.vm = null;
        this.username = null;
        this.projectId = null;
    }

}

export default CloudProvider;
