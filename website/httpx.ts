import * as http from 'http';
import * as Promise from 'bluebird';


export interface HasRequest {
    request(options: any, callback?: Function): http.ClientRequest;
}


export function request(module: HasRequest, options: any) {
    return new Promise((resolve, reject) => {
        var req = module.request(options, resolve);
        req.on('error', reject);
        req.end();
    });
}

export function readBody(response: http.ClientResponse) {
    return new Promise((resolve, reject) => {
        var data = '';
        response.on('data', (chunk: string) => {
            data += chunk;
        });
        response.on('close', () => {
            reject(void 0);
        });
        response.on('end', () => {
            resolve(data);
        });
    });
}

export function readBodyAsBuffer(response: http.ClientResponse) {
    return new Promise<Buffer>((resolve, reject) => {
        var data: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
            data.push(chunk);
        });
        response.on('close', () => {
            reject(void 0);
        });
        response.on('end', () => {
            resolve(Buffer.concat(data));
        });
    });
}
