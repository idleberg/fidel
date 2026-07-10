export interface OldForum {
	forumId: number;
	name: string;
	parentId?: number;
}

export const oldForums: OldForum[] = [
	// Top-level categories
	{ forumId: 132, name: 'Winamp' },
	{ forumId: 140, name: 'SHOUTcast' },
	{ forumId: 133, name: 'Visualizations' },
	{ forumId: 153, name: 'Skinning and Design' },
	{ forumId: 155, name: 'Games Center' },
	{ forumId: 157, name: "Music O'Rama" },
	{ forumId: 88, name: 'Community Center' },
	{ forumId: 89, name: 'Developer Center' },

	// Winamp
	{ forumId: 11, name: 'Winamp Technical Support', parentId: 132 },
	{ forumId: 8, name: 'Winamp Discussion', parentId: 132 },
	{ forumId: 3, name: 'Winamp Wishlist', parentId: 132 },
	{ forumId: 4, name: 'Winamp Bug Reports', parentId: 132 },
	{ forumId: 15, name: 'Tech Support Greatest Hits', parentId: 132 },
	{ forumId: 14, name: 'Winamp Development', parentId: 132 },

	// SHOUTcast
	{ forumId: 86, name: 'SHOUTcast Technical Support', parentId: 140 },
	{ forumId: 9, name: 'SHOUTcast Discussions', parentId: 140 },
	{ forumId: 152, name: 'Nullsoft Streaming Video', parentId: 140 },

	// Visualizations
	{ forumId: 85, name: 'AVS', parentId: 133 },
	{ forumId: 137, name: 'AVS Presets', parentId: 85 },
	{ forumId: 138, name: 'AVS Wishlist', parentId: 85 },
	{ forumId: 139, name: 'AVS Troubleshooting', parentId: 85 },
	{ forumId: 81, name: 'MilkDrop', parentId: 133 },
	{ forumId: 82, name: 'MilkDrop Troubleshooting Forum', parentId: 81 },
	{ forumId: 83, name: 'MilkDrop Feature Requests', parentId: 81 },
	{ forumId: 84, name: 'MilkDrop Presets', parentId: 81 },
	{ forumId: 161, name: 'MilkDrop Development', parentId: 81 },
	{ forumId: 149, name: 'Other Visualizations', parentId: 133 },
	{ forumId: 125, name: 'Smoke', parentId: 133 },
	{ forumId: 147, name: 'Visualization Mega SDK', parentId: 133 },
	{ forumId: 150, name: 'Monkey', parentId: 133 },
	{ forumId: 151, name: 'Geiss II', parentId: 133 },

	// Skinning and Design
	{ forumId: 5, name: 'Classic Skins', parentId: 153 },
	{ forumId: 123, name: 'Modern Skins', parentId: 153 },
	{ forumId: 18, name: 'Skinning Tips and Tricks', parentId: 153 },
	{ forumId: 12, name: 'Arts and Design', parentId: 153 },
	{ forumId: 119, name: 'Skin and Plug-in Rip Reporting for Removal', parentId: 153 },

	// Community Center
	{ forumId: 1, name: 'General Discussions', parentId: 88 },
	{ forumId: 80, name: 'Breaking News', parentId: 88 },
	{ forumId: 6, name: 'Movies and Television', parentId: 88 },
	{ forumId: 19, name: 'International Connection', parentId: 88 },
	{ forumId: 16, name: 'The Bitchlist', parentId: 88 },

	// Developer Center
	{ forumId: 65, name: 'NSIS Discussion', parentId: 89 },

	// Other
	{ forumId: 158, name: 'Recycle Bin' },
];

const oldForumsByName = new Map(oldForums.map((f) => [f.name.toLowerCase(), f]));
const oldForumsById = new Map(oldForums.map((f) => [f.forumId, f]));

export function findOldForumByName(name: string): OldForum | undefined {
	return oldForumsByName.get(name.toLowerCase());
}

export function findOldForumById(forumId: number): OldForum | undefined {
	return oldForumsById.get(forumId);
}
