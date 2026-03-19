import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback } from 'react';
import { App } from '@modelcontextprotocol/ext-apps';

type DashboardSection = 'overview' | 'security' | 'usage';

interface DashboardState {
	userId: string;
	section: DashboardSection;
	generatedAt: string;
}

function AccountDashboard() {
	const [app] = useState(
		() => new App({ name: 'Account Dashboard', version: '0.1.0' }, {}, { autoResize: true }),
	);
	const [state, setState] = useState<DashboardState | null>(null);
	const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
	const [refreshing, setRefreshing] = useState(false);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		app.ontoolresult = (result) => {
			if (result.structuredContent) {
				const data = result.structuredContent as unknown as DashboardState;
				setState(data);
				setActiveSection(data.section);
			}
		};

		app.ontoolinput = (input) => {
			if (input.arguments && typeof input.arguments === 'object') {
				const args = input.arguments as Partial<DashboardState>;
				if (args.section) {
					setActiveSection(args.section);
				}
			}
		};

		app.connect().then(
			() => setConnected(true),
			(connectionError: unknown) => {
				const message =
					connectionError instanceof Error ? connectionError.message : 'Failed to connect to host';
				setError(message);
			},
		);
	}, [app]);

	const handleRefresh = useCallback(
		async (section: DashboardSection) => {
			setRefreshing(true);
			setError(null);
			try {
				const result = await app.callServerTool({
					name: 'refresh_account_dashboard',
					arguments: { section },
				});
				if (result.structuredContent) {
					setState(result.structuredContent as unknown as DashboardState);
					setActiveSection(section);
				}
			} catch (refreshError: unknown) {
				const message =
					refreshError instanceof Error ? refreshError.message : 'Failed to refresh dashboard';
				setError(message);
			} finally {
				setRefreshing(false);
			}
		},
		[app],
	);

	if (!connected && !error) {
		return <div style={styles.loading}>Connecting…</div>;
	}

	if (error && !state) {
		return <div style={styles.error}>{error}</div>;
	}

	if (!state) {
		return <div style={styles.loading}>Waiting for dashboard data…</div>;
	}

	const sections: { key: DashboardSection; label: string }[] = [
		{ key: 'overview', label: 'Overview' },
		{ key: 'security', label: 'Security' },
		{ key: 'usage', label: 'Usage' },
	];

	return (
		<main style={styles.main}>
			<header style={styles.header}>
				<h1 style={styles.title}>Account Dashboard</h1>
				<span style={styles.userId}>{state.userId}</span>
			</header>

			<nav style={styles.nav}>
				{sections.map(({ key, label }) => (
					<button
						key={key}
						onClick={() => handleRefresh(key)}
						disabled={refreshing}
						style={{
							...styles.tab,
							...(activeSection === key ? styles.tabActive : {}),
						}}
					>
						{label}
					</button>
				))}
			</nav>

			{error && <div style={styles.errorBanner}>{error}</div>}

			<section style={styles.card}>
				<SectionContent section={activeSection} state={state} />
				<footer style={styles.footer}>
					<span style={styles.timestamp}>
						Updated: {new Date(state.generatedAt).toLocaleString()}
					</span>
					<button
						onClick={() => handleRefresh(activeSection)}
						disabled={refreshing}
						style={styles.refreshButton}
					>
						{refreshing ? 'Refreshing…' : 'Refresh'}
					</button>
				</footer>
			</section>
		</main>
	);
}

function SectionContent({ section, state }: { section: DashboardSection; state: DashboardState }) {
	switch (section) {
		case 'overview':
			return (
				<div>
					<h2 style={styles.sectionTitle}>Overview</h2>
					<p style={styles.text}>Account summary for {state.userId}.</p>
				</div>
			);
		case 'security':
			return (
				<div>
					<h2 style={styles.sectionTitle}>Security</h2>
					<p style={styles.text}>Security settings and recent activity.</p>
				</div>
			);
		case 'usage':
			return (
				<div>
					<h2 style={styles.sectionTitle}>Usage</h2>
					<p style={styles.text}>API usage and resource consumption.</p>
				</div>
			);
	}
}

const styles: Record<string, React.CSSProperties> = {
	loading: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: '120px',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		color: 'GrayText',
	},
	error: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: '120px',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		color: '#b91c1c',
	},
	errorBanner: {
		padding: '0.75rem 1rem',
		marginBottom: '1rem',
		borderRadius: '6px',
		border: '1px solid #fca5a5',
		background: '#fef2f2',
		color: '#b91c1c',
		fontSize: '0.875rem',
	},
	main: {
		maxWidth: '720px',
		margin: '1.5rem auto',
		padding: '0 1rem',
		fontFamily: 'system-ui, -apple-system, sans-serif',
	},
	header: {
		display: 'flex',
		alignItems: 'baseline',
		justifyContent: 'space-between',
		marginBottom: '1rem',
	},
	title: {
		fontSize: '1.5rem',
		fontWeight: 600,
	},
	userId: {
		fontSize: '0.875rem',
		color: 'GrayText',
	},
	nav: {
		display: 'flex',
		gap: '0.5rem',
		marginBottom: '1rem',
	},
	tab: {
		padding: '0.5rem 1rem',
		border: '1px solid ButtonBorder',
		borderRadius: '6px',
		background: 'ButtonFace',
		color: 'ButtonText',
		cursor: 'pointer',
		fontSize: '0.875rem',
	},
	tabActive: {
		background: 'Highlight',
		color: 'HighlightText',
		borderColor: 'Highlight',
	},
	card: {
		background: 'Canvas',
		border: '1px solid ButtonBorder',
		borderRadius: '10px',
		padding: '1.25rem',
	},
	sectionTitle: {
		fontSize: '1.125rem',
		fontWeight: 600,
		marginBottom: '0.75rem',
	},
	text: {
		lineHeight: 1.6,
		color: 'CanvasText',
	},
	footer: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: '1rem',
		paddingTop: '0.75rem',
		borderTop: '1px solid ButtonBorder',
	},
	timestamp: {
		fontSize: '0.75rem',
		color: 'GrayText',
	},
	refreshButton: {
		padding: '0.375rem 0.75rem',
		border: '1px solid ButtonBorder',
		borderRadius: '6px',
		background: 'ButtonFace',
		color: 'ButtonText',
		cursor: 'pointer',
		fontSize: '0.8125rem',
	},
};

const root = document.getElementById('root');
if (root) {
	createRoot(root).render(<AccountDashboard />);
}
