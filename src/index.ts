import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import utc from 'dayjs/plugin/utc';
import {
    Client,
    GatewayIntentBits,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    TextChannel,
    User,
} from 'discord.js';
import * as dotenv from 'dotenv';
import cron from 'node-cron';

dayjs.extend(utc);

dotenv.config();

dayjs.extend(isBetween);
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
});
const REACTION_EMOJIS = [
    '🤣',
    '😂',
    '974777892418519081',
    '956966036354265180',
    '954075635310035024',
    '930549056466485298',
];

const START_CONTEST_COMMAND = 'startcontest';
const WINNER_COMMAND = 'winner';

client.login(process.env.DISCORD_BOT_TOKEN);

class ContestManager {
    contestStartDate: dayjs.Dayjs | null = null;
    contestEndDate: dayjs.Dayjs | null = null;
    memeLeaderboard: Map<string, number> = new Map();
    lastAnnouncementDate: dayjs.Dayjs | null = null;


    startContest(): void {
        this.contestStartDate = dayjs();
        this.contestEndDate = this.contestStartDate.add(7, 'day');
        this.memeLeaderboard.clear();
        this.lastAnnouncementDate = dayjs();
    }

    isContestRunning(): boolean {
        if (!this.contestStartDate || !this.contestEndDate) {
            return false;
        }
        return dayjs().isBetween(this.contestStartDate, this.contestEndDate);
    }
}

const contestManager = new ContestManager();

client.once('ready', () => {
    console.log('Bot is ready!');

    // Schedule the task to be executed every Friday at 12:00 PM Colombia time
    cron.schedule(
        '0 12 * * 5',
        async () => {
            const winners = getTopMemes(3);
            if (winners.length > 0) {
                await announceWinner(winners);
            }
            contestManager.startContest();
        },
        {
            timezone: 'America/Bogota',
        }
    );
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === START_CONTEST_COMMAND) {
            contestManager.startContest();
            await interaction.reply('El concurso ha comenzado!');
        } else if (commandName === WINNER_COMMAND) {
            const winners = getTopMemes(3);
            if (winners.length > 0) {
                await announceWinner(winners);
                await interaction.reply('Ganadores anunciados!');
            } else {
                await interaction.reply('No winners found for this week.');
            }
        }
    } catch (error) {
        console.error(error);
        await interaction.reply('There was an error while executing this command!');
    }
});

client.on('messageReactionAdd', handleMessageReaction);

async function handleMessageReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
): Promise<void> {
    if (user.bot) return;

    const messageTime = dayjs(reaction.message.createdTimestamp);

    if (
        reaction.message.channel.id === process.env.MEME_CHANNEL_ID &&
        reaction.message.channel instanceof TextChannel &&
        (REACTION_EMOJIS?.includes(reaction.emoji.name ?? '') ||
            REACTION_EMOJIS?.includes(reaction.emoji.id ?? '')) &&
        contestManager.isContestRunning() &&
        (!contestManager.lastAnnouncementDate || messageTime.isAfter(contestManager.lastAnnouncementDate))
    ) {
        const currentReactions = contestManager.memeLeaderboard.get(reaction.message.id) || 0;
        contestManager.memeLeaderboard.set(reaction.message.id, currentReactions + 1);
    }
}

function getTopMemes(top: number): { messageId: string; reactions: number }[] {
    const sortedLeaderboard = Array.from(contestManager.memeLeaderboard.entries()).sort(
        (a, b) => b[1] - a[1]
    );

    return sortedLeaderboard
        .slice(0, top)
        .map(entry => ({ messageId: entry[0], reactions: entry[1] }));
}

interface MessageOptions {
    content: string;
    files?: string[];
}

async function announceWinner(winners: { messageId: string; reactions: number }[]): Promise<void> {
    if (!process.env.MEME_CHANNEL_ID) {
        console.error('MEME_CHANNEL_ID is not set in the environment variables');
        return;
    }

    const announcementChannel = (await client.channels.fetch(
        process.env.MEME_CHANNEL_ID
    )) as TextChannel;

    for (const [index, winner] of winners.entries()) {
        const winnerMessage = await announcementChannel.messages.fetch(winner.messageId);
        const winnerLink = winnerMessage.url;
        const messageOptions: MessageOptions = {
            content: `🎉 Felicitaciones, ${winnerMessage.author}! Tu post ha ganado el #${
                index + 1
            } puesto al "Meme de la semana" con ${
                winner.reactions
            } reacciones. #LaPlazaRulez!. Link: ${winnerLink} 🎉`,
        };

        const attachmentUrl = winnerMessage.attachments.first()?.url;

        if (attachmentUrl) {
            messageOptions['files'] = [attachmentUrl];
        }

        await announcementChannel.send(messageOptions);
    }
}
