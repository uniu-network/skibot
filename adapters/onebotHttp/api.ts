import axios from 'axios';

export async function callApi(baseUrl: string, path: string, body: object, accessToken?: string): Promise<any> {
    const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const res = await axios.post(`${url}${path}`, body, { headers });
    return res.data;
}

export async function approveFriend(baseUrl: string, flag: any, remark: any = "", accessToken?: string) {
    return await callApi(baseUrl, '/set_friend_add_request', { flag, approve: true, remark }, accessToken);
}

export async function rejectFriend(baseUrl: string, flag: any, accessToken?: string) {
    return await callApi(baseUrl, '/set_friend_add_request', { flag, approve: false }, accessToken);
}

export async function approveGroup(baseUrl: string, flag: any, subType: any, accessToken?: string) {
    return await callApi(baseUrl, '/set_group_add_request', { flag, sub_type: subType, approve: true }, accessToken);
}

export async function rejectGroup(baseUrl: string, flag: any, subType: any, reason: any = "", accessToken?: string) {
    return await callApi(baseUrl, '/set_group_add_request', { flag, sub_type: subType, approve: false, reason }, accessToken);
}

export async function setGroupBan(baseUrl: string, groupId: number, userId: number, duration: number, accessToken?: string) {
    return await callApi(baseUrl, '/set_group_ban', { group_id: groupId, user_id: userId, duration }, accessToken);
}
