export interface User {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  isOnline: boolean;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  image?: string;
  likes: number;
  comments: number;
  shares: number;
  timestamp: Date;
  isLiked: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  participant: User;
  messages: Message[];
  lastMessage: string;
  unreadCount: number;
}

export const currentUser: User = {
  id: "me",
  name: "Alex Rivera",
  username: "alexrivera",
  avatar: "https://i.pravatar.cc/150?img=12",
  bio: "Full-stack developer & digital nomad 🌍",
  followers: 1247,
  following: 389,
  isOnline: true,
};

export const users: User[] = [
  { id: "1", name: "Maya Chen", username: "mayachen", avatar: "https://i.pravatar.cc/150?img=5", bio: "UI/UX Designer ✨", followers: 3200, following: 540, isOnline: true },
  { id: "2", name: "Jordan Blake", username: "jblake", avatar: "https://i.pravatar.cc/150?img=8", bio: "Photographer & storyteller", followers: 8900, following: 220, isOnline: false },
  { id: "3", name: "Sam Patel", username: "sampatel", avatar: "https://i.pravatar.cc/150?img=11", bio: "Music producer 🎵", followers: 5600, following: 780, isOnline: true },
  { id: "4", name: "Luna Kim", username: "lunakim", avatar: "https://i.pravatar.cc/150?img=9", bio: "Travel blogger ✈️", followers: 12400, following: 310, isOnline: false },
  { id: "5", name: "Kai Nakamura", username: "kainakamura", avatar: "https://i.pravatar.cc/150?img=15", bio: "Game developer 🎮", followers: 2100, following: 450, isOnline: true },
];

export const posts: Post[] = [
  {
    id: "p1", author: users[0], content: "Just shipped a brand new design system 🚀 Really proud of how the component library turned out. Dark mode first, always.", likes: 142, comments: 23, shares: 18, timestamp: new Date(Date.now() - 1000 * 60 * 15), isLiked: false,
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&h=400&fit=crop",
  },
  {
    id: "p2", author: users[1], content: "Golden hour in the mountains. Sometimes you just need to disconnect to reconnect. 🏔️", likes: 891, comments: 67, shares: 45, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), isLiked: true,
    image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop",
  },
  {
    id: "p3", author: users[2], content: "New beat dropped today! Link in bio. Let me know what you think 🔥🎶", likes: 324, comments: 89, shares: 56, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), isLiked: false,
  },
  {
    id: "p4", author: users[3], content: "Exploring the streets of Tokyo at night. The neon lights are absolutely mesmerizing. This city never sleeps 🌃", likes: 2100, comments: 156, shares: 230, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8), isLiked: true,
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&h=400&fit=crop",
  },
  {
    id: "p5", author: users[4], content: "After 6 months of development, our indie game is finally in beta! Thanks to everyone who supported us along the way 🙏🎮", likes: 567, comments: 112, shares: 78, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12), isLiked: false,
  },
];

export const conversations: Conversation[] = [
  {
    id: "c1", participant: users[0], lastMessage: "That sounds great! Let's sync tomorrow.", unreadCount: 2,
    messages: [
      { id: "m1", senderId: "me", text: "Hey Maya! How's the design project going?", timestamp: new Date(Date.now() - 1000 * 60 * 30) },
      { id: "m2", senderId: "1", text: "It's going well! Almost done with the component library.", timestamp: new Date(Date.now() - 1000 * 60 * 25) },
      { id: "m3", senderId: "me", text: "Nice! Want to pair on the dark mode implementation?", timestamp: new Date(Date.now() - 1000 * 60 * 10) },
      { id: "m4", senderId: "1", text: "That sounds great! Let's sync tomorrow.", timestamp: new Date(Date.now() - 1000 * 60 * 5) },
    ],
  },
  {
    id: "c2", participant: users[2], lastMessage: "Check out this new track 🎵", unreadCount: 1,
    messages: [
      { id: "m5", senderId: "3", text: "Yo! I just finished producing a new track", timestamp: new Date(Date.now() - 1000 * 60 * 60) },
      { id: "m6", senderId: "me", text: "Can't wait to hear it!", timestamp: new Date(Date.now() - 1000 * 60 * 45) },
      { id: "m7", senderId: "3", text: "Check out this new track 🎵", timestamp: new Date(Date.now() - 1000 * 60 * 30) },
    ],
  },
  {
    id: "c3", participant: users[4], lastMessage: "The beta launch went awesome!", unreadCount: 0,
    messages: [
      { id: "m8", senderId: "me", text: "Congrats on the beta launch! 🎉", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3) },
      { id: "m9", senderId: "5", text: "Thanks! We got 500 signups in the first hour!", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) },
      { id: "m10", senderId: "5", text: "The beta launch went awesome!", timestamp: new Date(Date.now() - 1000 * 60 * 60) },
    ],
  },
  {
    id: "c4", participant: users[3], lastMessage: "The photos from Tokyo are 🔥", unreadCount: 0,
    messages: [
      { id: "m11", senderId: "4", text: "Hey! Just arrived in Tokyo!", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 10) },
      { id: "m12", senderId: "me", text: "The photos from Tokyo are 🔥", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8) },
    ],
  },
];
