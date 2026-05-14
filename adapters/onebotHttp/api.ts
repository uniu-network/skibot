import axios from 'axios';

export async function callApi(baseUrl: string, path: string, body: object): Promise<any> {
    const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const res = await axios.post(`${url}${path}`, body);
    return res.data;
}

export async function approveFriend(baseUrl: string, flag: any, remark: any = "") {
    return await callApi(baseUrl, '/set_friend_add_request', { flag, approve: true, remark });
}

export async function rejectFriend(baseUrl: string, flag: any) {
    return await callApi(baseUrl, '/set_friend_add_request', { flag, approve: false });
}

export async function approveGroup(baseUrl: string, flag: any, subType: any) {
    return await callApi(baseUrl, '/set_group_add_request', { flag, sub_type: subType, approve: true });
}

export async function rejectGroup(baseUrl: string, flag: any, subType: any, reason: any = "") {
    return await callApi(baseUrl, '/set_group_add_request', { flag, sub_type: subType, approve: false, reason });
}

export async function setGroupBan(baseUrl: string, groupId: number, userId: number, duration: number) {
    return await callApi(baseUrl, '/set_group_ban', { group_id: groupId, user_id: userId, duration });
}
