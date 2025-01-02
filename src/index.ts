import axios from 'axios';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

type User = {
    "id": string,
    "username": string,
    "full_name": string,
    "profile_pic_url": string,
    "is_private": boolean,
    "is_verified": boolean,
    "followed_by_viewer": boolean,
    "follows_viewer": boolean,
    "requested_by_viewer": boolean,
}

type Data = {
    count: number,
    has_next_page: boolean,
    end_cursor: string,
    users: User[],
}

enum Result {
    SUCCESS,
    FAILED,
    RETRY
}

type ProcessStatus = {
    total_followers: number,
    count_unfollowed: number,
    status: Result,
    unfollowed: User[],
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let process_status: ProcessStatus = {
    total_followers: 0,
    count_unfollowed: 0,
    status: Result.SUCCESS,
    unfollowed: []
}

const instagram_client = axios.create({
    // httpsAgent: new HttpsProxyAgent('http://localhost:8080'),
    proxy: false,
    baseURL: 'https://www.instagram.com',
    headers: {}
});

instagram_client.interceptors.request.use(async config => {
    let dalay_time = Math.floor(Math.random() * 10000) + 5000;

    console.log(`Delaying request for: ${dalay_time}ms`);

    await delay(dalay_time);
    return config;
});

const is_followed = (user: User) => user.followed_by_viewer;

async function followers(end_cursor: string = ''): Promise<Data> {
    const response = await instagram_client.get('/graphql/query', {
        params: new URLSearchParams({
            query_hash: '37479f2b8209594dde7facb0d904896a',//'3dec7e2c57367ef3da3d987d89f9dbc8',
            variables: JSON.stringify({
                id: '7816750562',
                first: 50,
                after: end_cursor
            })
        })
    });

    let users = response.data.data.user.edge_followed_by.edges.map((edge: any) => edge.node as User);

    let data: Data = {
        count: response.data.data.user.edge_followed_by.count,
        has_next_page: response.data.data.user.edge_followed_by.page_info.has_next_page,
        end_cursor: response.data.data.user.edge_followed_by.page_info.end_cursor,
        users: users,
    }

    return data;
}

async function remove_follower(user: User): Promise<Result> {
    try {
        await instagram_client.post(
            `/api/v1/web/friendships/${user.id}/remove_follower/`,
            new URLSearchParams({}),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            }
        )

        process_status.unfollowed.push(user);

        return Result.SUCCESS;

    } catch (error) {        
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            return Result.RETRY;
        }
        return Result.FAILED;
    }
}

async function main() {

    let fetch_followers = await followers();
    while (true) {
        let user = fetch_followers.users.shift();

        if (!user && fetch_followers.has_next_page) {
            console.log(`No more users to unfollow, fetching next page`);
            fetch_followers = await followers(fetch_followers.end_cursor);
            continue;
        }

        if (!user && !fetch_followers.has_next_page) {
            console.log(`All followers unfollowed`);
            break;
        }
        
        if (is_followed(user!!)) { continue; }

        console.log(`Unfollowing user: ${user!!.username} | ${user!!.id}`);

        let result = await remove_follower(user!!);

        switch (result) {
            case Result.SUCCESS:
                console.log(`[${process_status.count_unfollowed++}] Unfollowed => ${user!!.username} | ${user!!.id}`);
                continue;
            case Result.RETRY:
                fetch_followers.users.unshift(user!!);
                console.log(`Rate limit exceeded, waiting for 15 minutes before retrying`);
                await delay(900000);
                continue;
            case Result.FAILED:
                console.log(`Failed to unfollow user: ${user!!.username} | ${user!!.id}`);
                continue;
        }
    }

    console.log('Done!')
}

main();