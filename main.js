const codeengine = require('codeengine');

class Helpers {
	/**
	 * Helper function to handle API requests and errors
	 * @param {text} method - The HTTP method
	 * @param {text} url - The endpoint URL
	 * @param {Object} [body=null] - The request body
	 * @returns {Object} The response data
	 * @throws {Error} If the request fails
	 */
	static async handleRequest(method, url, body = null) {
		try {
			return await codeengine.sendRequest(method, url, body);
		} catch (error) {
			console.error(`Error with ${method} request to ${url}:`, error);
			throw error;
		}
	}
}

async function getUsersForDataset() {
	var users = [];
	var offset = 0;
	const limit = 100;
	var count;
	var moreData = true;
	const url = `/api/identity/v1/users/search?explain=false&cacheBuster=${new Date().getTime()}`;
	var body = {
		showCount: true,
		count: false,
		includeDeleted: true,
		onlyDeleted: false,
		includeSupport: true,
		limit: limit,
		offset: offset,
		sort: {
			field: 'created',
			order: 'ASC'
		},
		filters: [],
		ids: [],
		attributes: [
			'id',
			'displayName',
			'department',
			'userName',
			'emailAddress',
			'phoneNumber',
			'deskPhoneNumber',
			'title',
			'timeZone',
			'hireDate',
			'modified',
			'created',
			'alternateEmail',
			'employeeLocation',
			'employeeNumber',
			'employeeId',
			'locale',
			'roleId',
			'reportsTo',
			'isAnonymous',
			'isSystemUser',
			'isPending',
			'isActive',
			'invitorUserId',
			'lastActivity'
		],
		parts: ['DETAILED', 'GROUPS', 'ROLE', 'MINIMAL']
	};
	while (moreData) {
		const response = await handleRequest('POST', url, body);

		if (response.users && response.users.length > 0) {
			users.push(...response.users);
			count += response.users.length;
			// Increment offset to get next page
			offset += limit;
			body.offset = offset;

			if (count >= response.count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	return users;
}

async function uploadUsersToDataset(users, dataset) {
	const transformedUsers = users.map((user) => {
		user.attributes.forEach((attribute) => {
			const key = attribute.key;
			const value = attribute.values[0]; // Assuming values array always has one element
			user[key] = value;
		});
		delete user.attributes;
		delete user.role;
	});

	const csvString = [
		[
			'id',
			'displayName',
			'roleId',
			'emailAddress',
			'userName',
			'timeZone',
			'modified',
			'created',
			'isAnonymous',
			'isSystemUser',
			'isPending',
			'isActive',
			'avatarKey'
		],
		...transformedUsers.map((user) => [
			user.id,
			user.displayName,
			user.roleId,
			user.emailAddress,
			user.userName,
			user.timeZone,
			user.modified,
			user.created,
			user.isAnonymous,
			user.isSystemUser,
			user.isPending,
			user.isActive,
			user.avatarKey
		])
	]
		.map((e) => e.join(','))
		.join('\n');

	const createUploadResponse = await handleRequest(
		'POST',
		`/api/data/v3/datasources/${dataset}/uploads`,
		{ action: null, appendId: null }
	);
	const uploadId = createUploadResponse.uploadId;

	const uploadResponse = await handleRequest(
		'PUT',
		`/api/data/v3/datasources/${dataset}/uploads/${uploadId}/parts/1`,
		csvString
	);
	const commitResponse = await handleRequest(
		'PUT',
		`/api/data/v3/datasources/${dataset}/uploads/${uploadId}/commit`,
		{ action: 'REPLACE', index: true }
	);
	return commitResponse;
}

/**
 * Fetch detailed information for a specific user by Domo user ID.
 *
 * @param {string} userId - The unique identifier of the user in Domo.
 * @returns {Promise<void>} Resolves after logging the user details.
 */
async function getUserDetails(userId) {
	const url = `/api/content/v2/users/${userId}`;

	try {
		const response = await handleRequest('GET', url);
		console.log(response);
	} catch (error) {
		console.log('There was an error fetching the user: ' + error);
	}
}

/**
 * Retrieve all active sessions and delete those belonging to the specified user.
 *
 * @param {string} userId - The Domo user ID for which to delete active sessions.
 * @returns {Promise<void>} Resolves when all user's sessions are deleted or rejects on error.
 */
async function deleteUserSessions(userId) {
	const url = '/api/sessions/v1/admin?limit=99999999';
	try {
		// Fetch all sessions (potentially large number depending on 'limit')
		const response = await handleRequest('GET', url);

		// Find sessions assigned to the specified user
		const sessionsToDelete = response.filter((s) => s.userId === userId);

		// Delete all sessions concurrently and wait for completion
		await Promise.all(sessionsToDelete.map((s) => deleteSession(s.id)));
	} catch (error) {
		console.log('Error fetching or deleting sessions:', error);
	}
}

/**
 * Delete a session by its session ID.
 *
 * @param {string} sessionId - The ID of the session to delete.
 * @returns {Promise<void>} Resolves after session deletion, or logs error if deletion fails.
 */
async function deleteSession(sessionId) {
	const url = `api/sessions/v1/admin/${sessionId}`;

	try {
		const response = await handleRequest('DELETE', url);
	} catch (error) {
		console.log('There was an error deleting the session: ' + error);
	}
}

/**
 * Delete a user by its ID.
 *
 * @param {string} userId - The ID of the user to delete.
 * @returns {Promise<void>} Resolves after session deletion, or logs error if deletion fails.
 */
async function deleteUser(userId) {
	const url = `/api/identity/v1/users/${userId}`;

	try {
		const response = await handleRequest('DELETE', url);
	} catch (error) {
		console.log('There was an error deleting the user: ' + error);
	}
}

//---------------------------TRANSFER-----------------------//

async function transferContent(userId, newOwnerId) {
	await transferDatasets(userId, newOwnerId);

	await transferCards(userId, newOwnerId);

	await transferAlerts(userId, newOwnerId);

	await transferWorkflows(userId, newOwnerId);

	await transferTasks(userId, newOwnerId);

	await transferDataflows(userId, newOwnerId);

	await transferAppStudioApps(userId, newOwnerId);

	await transferPages(userId, newOwnerId);

	// Transfer Scheduled Reports
	const reports = await getScheduledReports(userId);
	await transferScheduledReports(reports, newOwnerId);

	// Transfer Goals
	const currentPeriodId = await getCurrentPeriod();
	const goals = await getGoals(userId, currentPeriodId);
	await transferGoals(goals, newOwnerId);

	// Transfer Groups
	const groups = await getGroups(userId);
	await transferGroups(groups, userId, newOwnerId);

	// Transfer AppDB Admin
	const appDbCollections = await getAppDbCollections(userId);
	await transferAppDbCollections(appDbCollections, newOwnerId);

	// Transfer Functions (Beast Modes and Variables)
	const beastModeIds = await getBeastModes(userId);
	await transferBeastModes(beastModeIds, newOwnerId);

	// Transfer Accounts
	const accountIds = await getAccounts(userId);
	await transferAccounts(accountIds, newOwnerId);

	// Transfer Jupyter Workspaces
	const jupyterWorkspaceIds = await getJupyterWorkspaces(userId);
	await transferJupyterWorkspaces(jupyterWorkspaceIds, newOwnerId);

	// Transfer Code Engine Package
	const codeEnginePackageIds = await getCodeEnginePackages(userId);
	await transferCodeEnginePackages(codeEnginePackageIds, newOwnerId);

	// Transfer FileSets
	const filesetIds = await getFilesets(userId);
	await transferFilesets(filesetIds, newOwnerId);

	// Get Publications
	const publications = await getPublications(userId);

	// Transfer Subscriptions
	const subscriptions = await getSubscriptions(userId);
	await transferSubscriptions(subscriptions, newOwnerId);

	// Transfer Sandbox Repositories
	const repositoryIds = await getRepositories(userId);
	await transferRepositories(repositoryIds, newOwnerId);

	// Transfer Approvals
	await getApprovals(userId, newOwnerId);

	// Transfer Custom Apps
	await getCustomApps(userId, newOwnerId);

	// Transfer AI Models
	await getAiModels(userId, newOwnerId);

	// Transfer AI Projects
	await getAiProjects(userId, newOwnerId);
}

//-------------------------DataSets--------------------------//

async function transferDatasets(userId, newOwnerId) {
	let datasets = [];

	const url = '/api/data/ui/v3/datasources/search';
	let offset = 0;
	const count = 100;
	let moreData = true;

	while (moreData) {
		const data = {
			entities: ['DATASET'],
			filters: [
				{
					field: 'owned_by_id',
					filterType: 'term',
					value: userId
				}
			],
			combineResults: true,
			query: '*',
			count: count,
			offset: offset,
			sort: {
				isRelevance: false,
				fieldSorts: [{ field: 'create_date', sortOrder: 'DESC' }]
			}
		};

		const response = await handleRequest('POST', url, data);

		if (response.dataSources && response.dataSources.length > 0) {
			// Extract ids and append to list
			const ids = response.dataSources.map((dataset) => dataset.id);
			datasets.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.dataSources.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	const body = {
		responsibleUserId: newOwnerId
	};
	for (let i = 0; i < datasets.length; i++) {
		await handleRequest(
			'PUT',
			`/api/data/v2/datasources/${datasets[i]}/responsibleUsers`,
			body
		);
	}
}

//----------------------Cards-------------------------//

async function transferCards(userId, newOwnerId) {
	const url = '/api/search/v1/query';

	let offset = 0;
	const count = 50;
	let moreData = true;

	while (moreData) {
		const data = {
			count: count,
			offset: offset,
			combineResults: false,
			query: '*',
			filters: [
				{
					name: 'OWNED_BY_ID',
					field: 'owned_by_id',
					facetType: 'user',
					value: `${userId}:USER`,
					filterType: 'term'
				}
			],
			entityList: [['card']]
		};

		const response = await handleRequest('POST', url, data);

		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const ids = response.searchObjects.map((card) => card.databaseId);
			const body = {
				cardIds: ids,
				cardOwners: [
					{
						id: `${newOwnerId}`,
						type: 'USER'
					}
				],
				note: '',
				sendEmail: false
			};

			const response = await handleRequest(
				'POST',
				'/api/content/v1/cards/owners/add',
				body
			);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

// -----------------Alerts--------------------------//
/**
 * Get alerts a user is subscribed to
 *
 * @param {string} userId - The ID of the user to get alerts for.
 * @returns {List<int>} List of alert IDs the user is subscribed to.
 */
async function transferAlerts(userId, newOwnerId) {
	let moreData = true;
	let offset = 0;
	const limit = 50;
	let alerts = [];
	while (moreData) {
		const response = await handleRequest(
			'GET',
			`/api/social/v4/alerts?ownerId=${userId}&limit=${limit}&offset=${offset}`
		);

		if (response.length > 0) {
			// Extract ids and append to list
			const ids = response.map((alert) => alert.id);
			alerts.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	const body = {
		alertSubscriptions: [{ subscriberId: newOwnerId, type: 'USER' }]
	};
	for (let i = 0; i < alerts.length; i++) {
		await handleRequest(
			'POST',
			`/api/social/v4/alerts/${alerts[i]}/share`,
			body
		);
	}
}

//---------------------------Workflows--------------------------------//
/**
 * Get Workflows owned by given user ID
 *
 * @param {string} userId - The ID of the owner to search for.
 * @returns {Array<string>} List of workflow IDs owned by the user.
 */
async function transferWorkflows(userId, newOwnerId) {
	const url = '/api/search/v1/query';
	let workflows = [];
	let offset = 0;
	const count = 100;
	let moreData = true;

	while (moreData) {
		const data = {
			query: '*',
			entityList: [['workflow_model']],
			count: count,
			offset: offset,
			filters: [
				{
					facetType: 'user',
					filterType: 'term',
					field: 'owned_by_id',
					value: `${userId}:USER`
				}
			]
		};

		const response = await handleRequest('POST', url, data);
		//console.log(response.searchObjects);

		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const ids = response.searchObjects.map((workflow) => workflow.uuid);
			workflows.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	const body = { owner: newOwnerId };

	for (let i = 0; i < workflows; i++) {
		const url = `/api/workflow/v1/models/${workflows[i]}`;
		await handleRequest('PUT', url, body);
	}
}

//--------------------------Tasks--------------------------//

async function transferTasks(userId, newOwnerId) {
	let tasks = [];
	let offset = 0;
	const limit = 100;
	let moreData = true;

	while (moreData) {
		const response = await handleRequest(
			'POST',
			`/api/queues/v1/tasks/list?limit=${limit}&offset=${offset}`,
			{ assignedTo: [userId], status: ['OPEN'] }
		);

		if (response && response.length > 0) {
			// Extract ids and append to list
			const ids = response.map((task) => ({
				id: task.id,
				queueId: task.queueId
			}));
			tasks.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	for (let i = 0; i < tasks.length; i++) {
		const url = `/api/queues/v1/${tasks[i].queueId}/tasks/${tasks[i].id}/assign`;

		const body = { userId: newOwnerId, type: 'USER', taskIds: [tasks[i].id] };

		await handleRequest('PUT', url, body);
	}
}

//----------------------------DataFlows-----------------------//

async function transferDataflows(userId, newOwnerId) {
	const url = '/api/search/v1/query';

	let dataflows = [];
	let offset = 0;
	const count = 100;
	let moreData = true;

	while (moreData) {
		const data = {
			entities: ['DATAFLOW'],
			filters: [
				{
					field: 'owned_by_id',
					filterType: 'term',
					value: userId
				}
			],
			query: '*',
			count: count,
			offset: offset
		};

		const response = await handleRequest('POST', url, data);
		//console.log(response.searchObjects);

		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const ids = response.searchObjects.map((dataflow) => dataflow.databaseId);
			dataflows.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	const body = { responsibleUserId: newOwnerId };

	for (let i = 0; i < dataflows.length; i++) {
		const url = `/api/dataprocessing/v1/dataflows/${dataflows[i]}/patch`;

		await handleRequest('PUT', url, body);
	}
}

//------------------------------------App Studio--------------------------//

async function transferAppStudioApps(userId, newOwnerId) {
	const limit = 30;
	let skip = 0;
	let moreData = true;
	const data = {};

	while (moreData) {
		const url = `/api/content/v1/dataapps/adminsummary?limit=${limit}&skip=${skip}`;
		const response = await handleRequest('POST', url, data);

		if (
			response.dataAppAdminSummaries &&
			response.dataAppAdminSummaries.length > 0
		) {
			// Extract ids and append to list
			const apps = response.dataAppAdminSummaries
				.filter((item) => item.owners.some((owner) => owner.id == userId))
				.map((item) => item.dataAppId);

			const body = {
				note: '',
				entityIds: apps,
				owners: [{ type: 'USER', id: newOwnerId }],
				sendEmail: false
			};
			await handleRequest('PUT', '/api/content/v1/dataapps/bulk/owners', body);
			// Increment offset to get next page
			skip += limit;

			// If less than pageSize returned, this is the last page
			if (response.dataAppAdminSummaries.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//-----------------------------------Pages------------------------------//

async function transferPages(userId, newOwnerId) {
	const url = '/api/search/v1/query';
	let offset = 0;
	const count = 50;
	let moreData = true;

	while (moreData) {
		const data = {
			count: count,
			offset: offset,
			combineResults: false,
			query: '*',
			filters: [
				{
					name: 'OWNED_BY_ID',
					field: 'owned_by_id',
					facetType: 'user',
					value: `${userId}:USER`,
					filterType: 'term'
				}
			],
			entityList: [['page']]
		};

		const response = await handleRequest('POST', url, data);
		//console.log(response.searchObjects);

		if (response.searchObjects && response.searchObjects.length > 0) {
			// Extract ids and append to list
			const pages = response.searchObjects.map((page) => page.databaseId);

			for (let i = 0; i < pages.length; i++) {
				const body = {
					owners: [{ id: newOwnerId, type: 'USER' }],
					pageIds: pages
				};

				await handleRequest('PUT', '/api/content/v1/pages/bulk/owners', body);
			}
			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchObjects.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
}

//---------------------------------Scheduled Reports--------------------------------//

async function transferScheduledReports(userId, newOwnerId) {
	const limit = 75;
	let skip = 0;
	let moreData = true;
	let resources = [];
	const url = 'api/query/v1/execute/b7306441-b8a7-481c-baaf-4fffadb0ff61';
	const body = {
		querySource: 'data_table',
		useCache: true,
		query: {
			columns: [
				{
					exprType: 'COLUMN',
					column: 'Report Id'
				},
				{
					exprType: 'COLUMN',
					column: 'Column 2'
				}
			],
			limit: {
				limit: 10000,
				offset: 0
			},
			orderByColumns: [
				{
					expression: {
						exprType: 'COLUMN',
						column: 'Column 1'
					},
					order: 'ASCENDING'
				}
			],
			groupByColumns: [
				{
					exprType: 'COLUMN',
					column: 'Column 1'
				}
			],
			where: {
				not: false,
				exprType: 'IN',
				leftExpr: {
					exprType: 'COLUMN',
					column: 'Column 1'
				},
				selectSet: [
					{
						exprType: 'STRING_VALUE',
						value: '<string>'
					}
				]
			},
			having: null
		},
		context: {
			calendar: 'StandardCalendar',
			features: {
				PerformTimeZoneConversion: true,
				AllowNullValues: true,
				TreatNumbersAsStrings: true
			}
		},
		// Used for Views Explorer, not the regular Data table
		viewTemplate: null,
		tableAliases: null
	};

	const body = {
		ownerId: newOwnerId
	};
	for (let i = 0; i < reports.length; i++) {
		const url = `/api/content/v1/reportschedules/${reports[i]}`;
		await handleRequest('PUT', url, body);
	}
}

//---------------------------------------------Goals------------------------------------------------//

async function getCurrentPeriod() {
	const url = '/api/social/v2/objectives/periods?all=true';

	try {
		const response = await handleRequest('GET', url);
		const currentPeriod = response.find((period) => period.current);
		return currentPeriod.id;
	} catch (error) {
		console.log('Error fetching current period: ', error);
	}
}

async function getGoals(userId, periodId) {
	const url = `api/social/v2/objectives/profile?filterKeyResults=false&includeSampleGoal=false&periodId=${periodId}&ownerId=${userId}`;

	const response = await handleRequest('GET', url);
	return response.personal;
}

async function transferGoals(goals, newOwnerId) {
	for (let i = 0; i < goals.length; i++) {
		const url = `/api/social/v1/objectives/${goals[i].id}`;

		goals[i].ownerId = newOwnerId;
		goals[i].owners = [
			{
				ownerId: newOwnerId,
				ownerType: 'USER',
				primary: false
			}
		];

		const data = goals[i];

		const response = await handleRequest('PUT', url, data);
		console.log(response);
	}
}

//-----------------------------------------Groups----------------------------------------//

async function getGroups(userId) {
	let groups = [];
	const limit = 100;
	let offset = 0;
	let moreData = true;

	while (moreData) {
		const url = `/api/content/v2/groups/grouplist?owner=${userId}&limit=${limit}&offset=${offset}`;
		const response = await handleRequest('GET', url);

		if (response && response.length > 0) {
			// Extract ids and append to list
			groups.push(...response);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	return groups;
}

async function transferGroups(groups, userId, newOwnerId) {
	const url = '/api/content/v2/groups/access';

	var data = [];
	for (let i = 0; i < groups.length; i++) {
		data.push({
			groupId: groups[i].id,
			addOwners: [{ type: 'USER', id: newOwnerId }],
			removeOwners: [{ type: 'USER', id: userId }]
		});
	}
	const response = await handleRequest('PUT', url, data);
}

//-----------------------------------------AppDB--------------------------------//
// Datastore owner cannot be updated

async function getAppDbCollections(userId) {
	const url = '/api/datastores/v1/collections/query';

	let moreData = true;
	let pageNumber = 1;
	const pageSize = 100;
	let collectionList = [];

	while (moreData) {
		const data = {
			collectionFilteringList: [
				{
					filterType: 'ownedby',
					comparingCriteria: 'equals',
					typedValue: userId
				}
			],
			pageSize: pageSize,
			pageNumber: pageNumber
		};

		const response = await handleRequest('POST', url, data);

		if (response.collections && response.collections.length > 0) {
			// Extract ids and append to list
			const ids = response.collections.map((collection) => collection.id);
			collectionList.push(...ids);

			// Increment offset to get next page
			pageNumber++;

			// If less than pageSize returned, this is the last page
			if (response.collections.length < pageSize) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	return collectionList;
}

async function transferAppDbCollections(collections, newOwnerId) {
	for (let i = 0; i < collections.length; i++) {
		const url = `/api/datastores/v1/collections/${collections[i]}`;

		const data = { id: collections[i], owner: newOwnerId };

		await handleRequest('PUT', url, data);
	}
}

//--------------------------Functions (Beast Modes and Variables)-------------------------//

async function getBeastModes(userId) {
	const url = '/api/query/v1/functions/search';

	let moreData = true;
	let offset = 0;
	const limit = 100;
	let beastModeIds = [];

	while (moreData) {
		const data = {
			name: '',
			filters: [
				{ field: 'owner', idList: [userId] },
				{
					field: 'notvariable'
				}
			],
			sort: {
				field: 'name',
				ascending: true
			},
			limit: limit,
			offset: offset
		};

		const response = await handleRequest('POST', url, data);
		//console.log(response.results);

		if (response.results && response.results.length > 0) {
			// Extract ids and append to list
			const ids = response.results.map((beastMode) => beastMode.id);
			beastModeIds.push(...ids);

			// Increment offset to get next page
			offset += limit;

			hasMore = response.hasMore;
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	return beastModeIds;
}

async function transferBeastModes(beastModeIds, newOwnerId) {
	const data = [];
	const url = '/api/query/v1/functions/bulk/template';

	for (let i = 0; i < beastModeIds.length; i++) {
		data.push({
			id: beastModeIds[i],
			owner: newOwnerId
		});
	}
	const body = {
		update: data
	};
	await handleRequest('PUT', url, body);
}

//-----------------------------Accounts---------------------//

async function getAccounts(userId) {
	const url = '/api/search/v1/query';

	let moreData = true;
	let offset = 0;
	const count = 100;
	let accountIds = [];

	while (moreData) {
		const data = {
			count: count,
			offset: offset,
			combineResults: false,
			hideSearchObjects: true,
			query: '**',
			filters: [
				{
					filterType: 'term',
					field: 'owned_by_id',
					value: userId,
					name: 'Owned by',
					not: false
				}
			],
			facetValuesToInclude: [],
			queryProfile: 'GLOBAL',
			entityList: [['account']]
		};

		const response = await handleRequest('POST', url, data);
		if (
			response.searchResultsMap &&
			response.searchResultsMap.account.length > 0
		) {
			// Extract ids and append to list
			const ids = response.searchResultsMap.account.map(
				(account) => account.id
			);
			accountIds.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchResultsMap.account.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
		moreData = false;
	}
	return accountIds;
}

async function transferAccounts(accountIds, newOwnerId) {
	for (let i = 0; i < accountIds.length; i++) {
		const url = `/api/data/v2/accounts/share/${accountIds[i]}`;

		const data = { type: 'USER', id: newOwnerId, accessLevel: 'OWNER' };

		const response = await handleRequest('PUT', url, data);
	}
}

//---------------------------Jupyter Workspaces---------------------//

async function getJupyterWorkspaces(userId) {
	const url = '/api/datascience/v1/search/workspaces';

	let moreData = true;
	let offset = 0;
	const limit = 100;
	let jupyterWorkspaceIds = [];
	while (moreData) {
		const data = {
			sortFieldMap: {
				LAST_RUN: 'DESC'
			},
			searchFieldMap: {},
			filters: [
				{
					type: 'OWNER',
					values: [userId]
				}
			],
			offset: offset,
			limit: limit
		};

		const response = await handleRequest('POST', url, data);
		//console.log(response);

		if (response.workspaces && response.workspaces.length > 0) {
			// Extract ids and append to list
			const ids = response.workspaces.map((workspace) => workspace.id);
			jupyterWorkspaceIds.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.workspaces.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	return jupyterWorkspaceIds;
}

async function transferJupyterWorkspaces(jupyterWorkspaceIds, newOwnerId) {
	const data = { newOwnerId };
	for (let i = 0; i < jupyterWorkspaceIds.length; i++) {
		const url = `/api/datascience/v1/workspaces/${jupyterWorkspaceIds[i]}/ownership`;
		await handleRequest('PUT', url, data);
	}
}

//------------------------------Code Engine Packages--------------------------//

async function getCodeEnginePackages(userId) {
	const url = '/api/search/v1/query';

	let moreData = true;
	let offset = 0;
	const count = 100;
	let codeEnginePackageIds = [];

	while (moreData) {
		const data = {
			query: '**',
			entityList: [['package']],
			count: count,
			offset: offset,
			filters: [
				{
					field: 'owned_by_id',
					filterType: 'term',
					value: `${userId}:USER`
				}
			],
			hideSearchObjects: true,
			facetValuesToInclude: []
		};

		const response = await handleRequest('POST', url, data);

		if (
			response.searchResultsMap.package &&
			response.searchResultsMap.package.length > 0
		) {
			// Extract ids and append to list
			const ids = response.searchResultsMap.package.map(
				(codeEngine) => codeEngine.uuid
			);
			codeEnginePackageIds.push(...ids);

			// Increment offset to get next page
			offset += count;

			// If less than pageSize returned, this is the last page
			if (response.searchResultsMap.package.length < count) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}

	return codeEnginePackageIds;
}

async function transferCodeEnginePackages(codeEnginePackageIds, newOwnerId) {
	const data = { owner: parseInt(newOwnerId) };
	for (let i = 0; i < codeEnginePackageIds.length; i++) {
		const url = `/api/codeengine/v2/packages/${codeEnginePackageIds[i]}`;
		await handleRequest('PUT', url, data);
	}
}

//---------------------------------------FileSets--------------------------------------------//

async function getFilesets(userId) {
	let moreData = true;
	let offset = 0;
	const limit = 100;
	let filesetIds = [];
	const body = {
		filters: [
			{
				field: 'owner',
				idList: [userId],
				not: false,
				operator: 'EQUALS'
			}
		],
		fieldSort: {
			field: 'updated',
			order: 'DESC'
		},
		dateFilters: []
	};

	while (moreData) {
		const url = `/api/files/v1/filesets/search?offset=${offset}&limit=${limit}`;

		const response = await handleRequest('POST', url, body);
		if (response.filesets && response.filesets.length > 0) {
			// Extract ids and append to list
			const ids = response.filesets.map((fileset) => fileset.id);
			filesetIds.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.filesets.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	return filesetIds;
}

async function transferFilesets(filesetIds, newOwnerId) {
	const body = { userId: parseInt(newOwnerId) };

	for (let i = 0; i < filesetIds.length; i++) {
		const url = `/api/files/v1/filesets/${filesetIds[i]}/ownership`;
		await handleRequest('POST', url, body);
	}
}

//--------------------------------------Domo Everywhere Publications------------------------------------------//

// Limitation the new owner must be an owner of all the content
// Just get a list of publications for the manager to review

async function getPublications(userId) {
	let publicationList = [];
	const url = '/api/publish/v2/publications';

	const response = await handleRequest('GET', url);
	for (let i = 0; i < response.length; i++) {
		const publicationId = response[i].id;
		const publicationUrl = `/api/publish/v2/publications/${publicationId}`;
		const response2 = await handleRequest('GET', publicationUrl);
		if (response2.content.userId == userId) {
			publicationList.push(publicationId);
		}
	}

	return publicationList;
}

//-------------------------------------Domo Everywhere Subscriptions-----------------------------------------//

async function getSubscriptions(userId) {
	const url = 'api/publish/v2/subscriptions/summaries';

	const subscriptionsAll = await handleRequest('GET', url);
	let subscriptionsList = [];
	for (let i = 0; i < subscriptionsAll.length; i++) {
		const subscriptionUrl = `api/publish/v2/subscriptions/${subscriptionsAll[i].subscriptionId}/share`;

		const subscription = await handleRequest('GET', subscriptionUrl);
		if (subscription.userId == userId) {
			subscriptionsList.push(subscription);
		}
	}
	return subscriptionsList;
}

async function transferSubscriptions(subscriptions, newOwnerId) {
	for (let i = 0; i < subscriptions.length; i++) {
		const url = `/api/publish/v2/subscriptions/${subscriptions[i].subscription.id}`;

		const body = {
			publicationId: subscriptions[i].subscription.publicationId,
			domain: subscriptions[i].subscription.domain,
			customerId: subscriptions[i].subscription.customerId,
			userId: newOwnerId,
			userIds: subscriptions[i].shareUsers,
			groupIds: subscriptions[i].shareGroups
		};

		await handleRequest('PUT', url, body);
	}
}

//--------------------------------------------------Sandbox Repositories---------------------------------//

async function getRepositories(userId) {
	const url = '/api/version/v1/repositories/search';

	let moreData = true;
	let offset = 0;
	const limit = 50;
	let repositoryIds = [];

	while (moreData) {
		const data = {
			query: {
				offset: offset,
				limit: limit,
				fieldSearchMap: {},
				sort: 'lastCommit',
				order: 'desc',
				filters: { userId: [userId] },
				dateFilters: {}
			}
		};

		const response = await handleRequest('POST', url, data);

		if (response.repositories && response.repositories.length > 0) {
			// Extract ids and append to list
			const ids = response.repositories.map((repository) => repository.id);
			repositoryIds.push(...ids);

			// Increment offset to get next page
			offset += limit;

			// If less than pageSize returned, this is the last page
			if (response.repositories.length < limit) {
				moreData = false;
			}
		} else {
			// No more data returned, stop loop
			moreData = false;
		}
	}
	return repositoryIds;
}

async function transferRepositories(repositoryIds, newOwnerId) {
	for (let i = 0; i < repositoryIds.length; i++) {
		const url = `/api/version/v1/repositories/${repositoryIds[i]}`;

		const body = {
			repositoryPermissionUpdates: [
				{
					userId: newOwnerId,
					groupId: '',
					permission: 'OWNER'
				}
			]
		};

		await handleRequest('POST', url, body);
	}
}

//-----------------------------------------Approvals--------------------------------------//

async function getApprovals(userId, newOwnerId) {
	const url = '/api/synapse/approval/graphql';
	const approvalList = [];

	const data = [
		{
			operationName: 'getStats',
			query:
				'query getStats($from: Int!, $to: Int!, $threshold: Int!) {\n  countTotalRequests {\n    current\n    __typename\n  }\n  countStaleRequests(from: $from, to: $to, threshold: $threshold) {\n    current\n    __typename\n  }\n}\n'
		},
		{
			operationName: 'getFilteredRequests',
			variables: {
				query: {
					active: true,
					submitterId: null,
					approverId: userId,
					templateId: null,
					title: null,
					lastModifiedBefore: null
				},
				after: null,
				reverseSort: false
			},
			query:
				'query getFilteredRequests($query: QueryRequest!, $after: ID, $reverseSort: Boolean) {\n  workflowSearch(query: $query, type: "AC", after: $after, reverseSort: $reverseSort) {\n    edges {\n      cursor\n      node {\n        approval {\n          id\n          title\n          templateTitle\n          status\n          modifiedTime\n          version\n          providerName\n          approvalChainIdx\n          pendingApprover: pendingApproverEx {\n            id\n            type\n            displayName\n            ... on User {\n              title\n              avatarKey\n              __typename\n            }\n            ... on Group {\n              isDeleted\n              __typename\n            }\n            __typename\n          }\n          submitter {\n            id\n            type\n            displayName\n            avatarKey\n            isCurrentUser\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    pageInfo {\n      hasNextPage\n      hasPreviousPage\n      startCursor\n      endCursor\n      __typename\n    }\n    __typename\n  }\n}\n'
		}
	];

	const response = await handleRequest('POST', url, data);
	const responseApprovals = response[1].data.workflowSearch.edges;

	console.log(response[1].data.workflowSearch.edges[0].node.approval);

	for (let i = 0; i < responseApprovals.length; i++) {
		const approverId = responseApprovals[i].node.approval.pendingApprover.id;
		const approvalId = responseApprovals[i].node.approval.id;
		const version = responseApprovals[i].node.approval.version;

		if (approverId == userId) {
			await transferApprovals(approvalId, newOwnerId, version);
			//approvalList.push(approvalId);
		}
	}

	console.log(approvalList);
}

async function transferApprovals(approvalId, newOwnerId, version) {
	const url = '/api/synapse/approval/graphql';

	const data = [
		{
			operationName: 'replaceApprovers',
			variables: {
				actedOnApprovals: [
					{
						id: approvalId,
						version: version
					}
				],
				newApproverId: newOwnerId,
				newApproverType: 'PERSON'
			},
			query:
				'mutation replaceApprovers($actedOnApprovals: [ActedOnApprovalInput!]!, $newApproverId: ID!, $newApproverType: ApproverType) {\n  bulkReplaceApprover(actedOnApprovals: $actedOnApprovals, newApproverId: $newApproverId, newApproverType: $newApproverType) {\n    id\n    __typename\n  }\n}\n'
		}
	];
}

//--------------------------------Custom Apps (Bricks and Pro Code Apps)-------------------------------------//

async function getCustomApps(userId, newOwnerId) {
	const limit = 30;
	let offset = 0;
	let moreData = true;
	let customAppIds = [];

	while (moreData) {
		const url = `/api/apps/v1/designs?checkAdminAuthority=true&${limit}&offset=${offset}`;
		const response = await handleRequest('GET', url);

		for (let i = 0; i < response.length; i++) {
			if (response[i].owner == userId) {
				customAppIds.push(response[i].id);
			}
		}

		if (response.length < limit) {
			moreData = false;
		}

		offset += limit;
	}
}

async function transferCustomApps(customAppIds, newOwnerId) {
	const url = `/api/apps/v1/designs/${customAppId}/permissions/ADMIN`;

	const data = [newOwnerId];

	const response = await handleRequest('POST', url, data);
}

//-------------------------------------AI Models--------------------------------//

async function getAiModels(userId, newOwnerId) {
	const url = '/api/datascience/ml/v1/search/models';

	const data = {
		limit: 50,
		sortFieldMap: {
			CREATED: 'DESC'
		},
		searchFieldMap: { NAME: '' },
		filters: [{ type: 'OWNER', values: [userId] }],
		metricFilters: {},
		dateFilters: {},
		sortMetricMap: {}
	};

	const response = await handleRequest('POST', url, data);
	const modelsList = response.models;

	for (let i = 0; i < modelsList.length; i++) {
		await aiModelChangeOwner(response.models[i].id, newOwnerId);
		//console.log(response.models[i].id);
	}
}

async function aiModelChangeOwner(modelId, newOwnerId) {
	const url = `/api/datascience/ml/v1/models/${modelId}/ownership`;

	const data = { userId: newOwnerId };

	const response = await handleRequest('POST', url, data);
	console.log(response);
}

//-----------------------------------AI Projects----------------------------------//

async function getAiProjects(userId, newOwnerId) {
	const url = '/api/datascience/ml/v1/search/projects';

	const data = {
		limit: 50,
		sortFieldMap: { CREATED: 'DESC' },
		searchFieldMap: { NAME: '' },
		filters: [{ type: 'OWNER', values: [userId] }],
		dateFilters: {}
	};

	const response = await handleRequest('POST', url, data);
	console.log(response);
	const projectsList = response.projects;

	for (let i = 0; i < projectsList.length; i++) {
		await aiProjectChangeOwner(response.projects[i].id, newOwnerId);
		//console.log(response.projects[i].id);
	}
}

async function aiProjectChangeOwner(projectId, newOwnerId) {
	const url = `/api/datascience/ml/v1/projects/${projectId}/ownership`;

	const data = { userId: newOwnerId };

	const response = await handleRequest('POST', url, data);
	console.log(response);
}
