var Gw = Object.create;
var { getPrototypeOf: Zw, defineProperty: RQ, getOwnPropertyNames: Yw } = Object;
var $w = Object.prototype.hasOwnProperty;
function Rw(h) {
	return this[h];
}
var zw,
	Hw,
	n2 = (h, q0, O0) => {
		var C0 = h != null && typeof h === 'object';
		if (C0) {
			var E0 = q0 ? (zw ??= new WeakMap()) : (Hw ??= new WeakMap()),
				h0 = E0.get(h);
			if (h0) return h0;
		}
		O0 = h != null ? Gw(Zw(h)) : {};
		let X2 = q0 || !h || !h.__esModule ? RQ(O0, 'default', { value: h, enumerable: !0 }) : O0;
		for (let E of Yw(h)) if (!$w.call(X2, E)) RQ(X2, E, { get: Rw.bind(h, E), enumerable: !0 });
		if (C0) E0.set(h, X2);
		return X2;
	};
var v1 = (h, q0) => () => (q0 || h((q0 = { exports: {} }).exports, q0), q0.exports);
var uX = v1((Jw, f9) => {
	(function () {
		function h(U, O) {
			Object.defineProperty(C0.prototype, U, {
				get: function () {
					console.warn('%s(...) is deprecated in plain JavaScript React classes. %s', O[0], O[1]);
				},
			});
		}
		function q0(U) {
			if (U === null || typeof U !== 'object') return null;
			return ((U = (F4 && U[F4]) || U['@@iterator']), typeof U === 'function' ? U : null);
		}
		function O0(U, O) {
			U = ((U = U.constructor) && (U.displayName || U.name)) || 'ReactClass';
			var N = U + '.' + O;
			k[N] ||
				(console.error(
					"Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
					O,
					U,
				),
				(k[N] = !0));
		}
		function C0(U, O, N) {
			((this.props = U), (this.context = O), (this.refs = t6), (this.updater = N || k1));
		}
		function E0() {}
		function h0(U, O, N) {
			((this.props = U), (this.context = O), (this.refs = t6), (this.updater = N || k1));
		}
		function X2() {}
		function E(U) {
			return '' + U;
		}
		function I2(U) {
			try {
				E(U);
				var O = !1;
			} catch (b) {
				O = !0;
			}
			if (O) {
				O = console;
				var N = O.error,
					C =
						(typeof Symbol === 'function' && Symbol.toStringTag && U[Symbol.toStringTag]) ||
						U.constructor.name ||
						'Object';
				return (
					N.call(
						O,
						'The provided key is an unsupported type %s. This value must be coerced to a string before using it here.',
						C,
					),
					E(U)
				);
			}
		}
		function v2(U) {
			if (U == null) return null;
			if (typeof U === 'function')
				return U.$$typeof === dX ? null : U.displayName || U.name || null;
			if (typeof U === 'string') return U;
			switch (U) {
				case j0:
					return 'Fragment';
				case o:
					return 'Profiler';
				case P:
					return 'StrictMode';
				case a5:
					return 'Suspense';
				case o0:
					return 'SuspenseList';
				case x6:
					return 'Activity';
			}
			if (typeof U === 'object')
				switch (
					(typeof U.tag === 'number' &&
						console.error(
							'Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.',
						),
					U.$$typeof)
				) {
					case A0:
						return 'Portal';
					case P0:
						return U.displayName || 'Context';
					case F0:
						return (U._context.displayName || 'Context') + '.Consumer';
					case I0:
						var O = U.render;
						return (
							(U = U.displayName),
							U ||
								((U = O.displayName || O.name || ''),
								(U = U !== '' ? 'ForwardRef(' + U + ')' : 'ForwardRef')),
							U
						);
					case e2:
						return ((O = U.displayName || null), O !== null ? O : v2(U.type) || 'Memo');
					case _5:
						((O = U._payload), (U = U._init));
						try {
							return v2(U(O));
						} catch (N) {}
				}
			return null;
		}
		function I(U) {
			if (U === j0) return '<>';
			if (typeof U === 'object' && U !== null && U.$$typeof === _5) return '<...>';
			try {
				var O = v2(U);
				return O ? '<' + O + '>' : '<...>';
			} catch (N) {
				return '<...>';
			}
		}
		function j() {
			var U = r.A;
			return U === null ? null : U.getOwner();
		}
		function g() {
			return Error('react-stack-top-frame');
		}
		function D0(U) {
			if (b1.call(U, 'key')) {
				var O = Object.getOwnPropertyDescriptor(U, 'key').get;
				if (O && O.isReactWarning) return !1;
			}
			return U.key !== void 0;
		}
		function i2(U, O) {
			function N() {
				P4 ||
					((P4 = !0),
					console.error(
						'%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)',
						O,
					));
			}
			((N.isReactWarning = !0), Object.defineProperty(U, 'key', { get: N, configurable: !0 }));
		}
		function p0() {
			var U = v2(this.type);
			return (
				dB[U] ||
					((dB[U] = !0),
					console.error(
						'Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.',
					)),
				(U = this.props.ref),
				U !== void 0 ? U : null
			);
		}
		function m0(U, O, N, C, b, n) {
			var i = N.ref;
			return (
				(U = { $$typeof: d, type: U, key: O, props: N, _owner: C }),
				(i !== void 0 ? i : null) !== null
					? Object.defineProperty(U, 'ref', { enumerable: !1, get: p0 })
					: Object.defineProperty(U, 'ref', { enumerable: !1, value: null }),
				(U._store = {}),
				Object.defineProperty(U._store, 'validated', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: 0,
				}),
				Object.defineProperty(U, '_debugInfo', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: null,
				}),
				Object.defineProperty(U, '_debugStack', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: b,
				}),
				Object.defineProperty(U, '_debugTask', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: n,
				}),
				Object.freeze && (Object.freeze(U.props), Object.freeze(U)),
				U
			);
		}
		function t2(U, O) {
			return (
				(O = m0(U.type, O, U.props, U._owner, U._debugStack, U._debugTask)),
				U._store && (O._store.validated = U._store.validated),
				O
			);
		}
		function r2(U) {
			A2(U)
				? U._store && (U._store.validated = 1)
				: typeof U === 'object' &&
					U !== null &&
					U.$$typeof === _5 &&
					(U._payload.status === 'fulfilled'
						? A2(U._payload.value) &&
							U._payload.value._store &&
							(U._payload.value._store.validated = 1)
						: U._store && (U._store.validated = 1));
		}
		function A2(U) {
			return typeof U === 'object' && U !== null && U.$$typeof === d;
		}
		function p5(U) {
			var O = { '=': '=0', ':': '=2' };
			return (
				'$' +
				U.replace(/[=:]/g, function (N) {
					return O[N];
				})
			);
		}
		function c5(U, O) {
			return typeof U === 'object' && U !== null && U.key != null
				? (I2(U.key), p5('' + U.key))
				: O.toString(36);
		}
		function P6(U) {
			switch (U.status) {
				case 'fulfilled':
					return U.value;
				case 'rejected':
					throw U.reason;
				default:
					switch (
						(typeof U.status === 'string'
							? U.then(X2, X2)
							: ((U.status = 'pending'),
								U.then(
									function (O) {
										U.status === 'pending' && ((U.status = 'fulfilled'), (U.value = O));
									},
									function (O) {
										U.status === 'pending' && ((U.status = 'rejected'), (U.reason = O));
									},
								)),
						U.status)
					) {
						case 'fulfilled':
							return U.value;
						case 'rejected':
							throw U.reason;
					}
			}
			throw U;
		}
		function U2(U, O, N, C, b) {
			var n = typeof U;
			if (n === 'undefined' || n === 'boolean') U = null;
			var i = !1;
			if (U === null) i = !0;
			else
				switch (n) {
					case 'bigint':
					case 'string':
					case 'number':
						i = !0;
						break;
					case 'object':
						switch (U.$$typeof) {
							case d:
							case A0:
								i = !0;
								break;
							case _5:
								return ((i = U._init), U2(i(U._payload), O, N, C, b));
						}
				}
			if (i) {
				((i = U), (b = b(i)));
				var W0 = C === '' ? '.' + c5(i, 0) : C;
				return (
					V0(b)
						? ((N = ''),
							W0 != null && (N = W0.replace(y1, '$&/') + '/'),
							U2(b, O, N, '', function (V2) {
								return V2;
							}))
						: b != null &&
							(A2(b) &&
								(b.key != null && ((i && i.key === b.key) || I2(b.key)),
								(N = t2(
									b,
									N +
										(b.key == null || (i && i.key === b.key)
											? ''
											: ('' + b.key).replace(y1, '$&/') + '/') +
										W0,
								)),
								C !== '' &&
									i != null &&
									A2(i) &&
									i.key == null &&
									i._store &&
									!i._store.validated &&
									(N._store.validated = 2),
								(b = N)),
							O.push(b)),
					1
				);
			}
			if (((i = 0), (W0 = C === '' ? '.' : C + ':'), V0(U)))
				for (var f = 0; f < U.length; f++)
					((C = U[f]), (n = W0 + c5(C, f)), (i += U2(C, O, N, n, b)));
			else if (((f = q0(U)), typeof f === 'function'))
				for (
					f === U.entries &&
						(m1 ||
							console.warn(
								'Using Maps as children is not supported. Use an array of keyed ReactElements instead.',
							),
						(m1 = !0)),
						U = f.call(U),
						f = 0;
					!(C = U.next()).done;
				)
					((C = C.value), (n = W0 + c5(C, f++)), (i += U2(C, O, N, n, b)));
			else if (n === 'object') {
				if (typeof U.then === 'function') return U2(P6(U), O, N, C, b);
				throw (
					(O = String(U)),
					Error(
						'Objects are not valid as a React child (found: ' +
							(O === '[object Object]'
								? 'object with keys {' + Object.keys(U).join(', ') + '}'
								: O) +
							'). If you meant to render a collection of children, use an array instead.',
					)
				);
			}
			return i;
		}
		function J0(U, O, N) {
			if (U == null) return U;
			var C = [],
				b = 0;
			return (
				U2(U, C, '', '', function (n) {
					return O.call(N, n, b++);
				}),
				C
			);
		}
		function O5(U) {
			if (U._status === -1) {
				var O = U._ioInfo;
				(O != null && (O.start = O.end = performance.now()), (O = U._result));
				var N = O();
				if (
					(N.then(
						function (b) {
							if (U._status === 0 || U._status === -1) {
								((U._status = 1), (U._result = b));
								var n = U._ioInfo;
								(n != null && (n.end = performance.now()),
									N.status === void 0 && ((N.status = 'fulfilled'), (N.value = b)));
							}
						},
						function (b) {
							if (U._status === 0 || U._status === -1) {
								((U._status = 2), (U._result = b));
								var n = U._ioInfo;
								(n != null && (n.end = performance.now()),
									N.status === void 0 && ((N.status = 'rejected'), (N.reason = b)));
							}
						},
					),
					(O = U._ioInfo),
					O != null)
				) {
					O.value = N;
					var C = N.displayName;
					typeof C === 'string' && (O.name = C);
				}
				U._status === -1 && ((U._status = 0), (U._result = N));
			}
			if (U._status === 1)
				return (
					(O = U._result),
					O === void 0 &&
						console.error(
							`lazy: Expected the result of a dynamic import() call. Instead received: %s

Your code should look like: 
  const MyComponent = lazy(() => import('./MyComponent'))

Did you accidentally put curly braces around the import?`,
							O,
						),
					'default' in O ||
						console.error(
							`lazy: Expected the result of a dynamic import() call. Instead received: %s

Your code should look like: 
  const MyComponent = lazy(() => import('./MyComponent'))`,
							O,
						),
					O.default
				);
			throw U._result;
		}
		function v() {
			var U = r.H;
			return (
				U === null &&
					console.error(`Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`),
				U
			);
		}
		function G2() {
			r.asyncTransitions--;
		}
		function K0(U) {
			if (lB === null)
				try {
					var O = ('require' + Math.random()).slice(0, 7);
					lB = (f9 && f9[O]).call(f9, 'timers').setImmediate;
				} catch (N) {
					lB = function (C) {
						x4 === !1 &&
							((x4 = !0),
							typeof MessageChannel > 'u' &&
								console.error(
									'This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning.',
								));
						var b = new MessageChannel();
						((b.port1.onmessage = C), b.port2.postMessage(void 0));
					};
				}
			return lB(U);
		}
		function z0(U) {
			return 1 < U.length && typeof AggregateError === 'function' ? AggregateError(U) : U[0];
		}
		function j2(U, O) {
			(O !== pB - 1 &&
				console.error(
					'You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ',
				),
				(pB = O));
		}
		function T(U, O, N) {
			var C = r.actQueue;
			if (C !== null)
				if (C.length !== 0)
					try {
						(l(C),
							K0(function () {
								return T(U, O, N);
							}));
						return;
					} catch (b) {
						r.thrownErrors.push(b);
					}
				else r.actQueue = null;
			0 < r.thrownErrors.length
				? ((C = z0(r.thrownErrors)), (r.thrownErrors.length = 0), N(C))
				: O(U);
		}
		function l(U) {
			if (!aB) {
				aB = !0;
				var O = 0;
				try {
					for (; O < U.length; O++) {
						var N = U[O];
						do {
							r.didUsePromise = !1;
							var C = N(!1);
							if (C !== null) {
								if (r.didUsePromise) {
									((U[O] = N), U.splice(0, O));
									return;
								}
								N = C;
							} else break;
						} while (1);
					}
					U.length = 0;
				} catch (b) {
					(U.splice(0, O + 1), r.thrownErrors.push(b));
				} finally {
					aB = !1;
				}
			}
		}
		typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
			typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === 'function' &&
			__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var d = Symbol.for('react.transitional.element'),
			A0 = Symbol.for('react.portal'),
			j0 = Symbol.for('react.fragment'),
			P = Symbol.for('react.strict_mode'),
			o = Symbol.for('react.profiler'),
			F0 = Symbol.for('react.consumer'),
			P0 = Symbol.for('react.context'),
			I0 = Symbol.for('react.forward_ref'),
			a5 = Symbol.for('react.suspense'),
			o0 = Symbol.for('react.suspense_list'),
			e2 = Symbol.for('react.memo'),
			_5 = Symbol.for('react.lazy'),
			x6 = Symbol.for('react.activity'),
			F4 = Symbol.iterator,
			k = {},
			k1 = {
				isMounted: function () {
					return !1;
				},
				enqueueForceUpdate: function (U) {
					O0(U, 'forceUpdate');
				},
				enqueueReplaceState: function (U) {
					O0(U, 'replaceState');
				},
				enqueueSetState: function (U) {
					O0(U, 'setState');
				},
			},
			hB = Object.assign,
			t6 = {};
		(Object.freeze(t6),
			(C0.prototype.isReactComponent = {}),
			(C0.prototype.setState = function (U, O) {
				if (typeof U !== 'object' && typeof U !== 'function' && U != null)
					throw Error(
						'takes an object of state variables to update or a function which returns an object of state variables.',
					);
				this.updater.enqueueSetState(this, U, O, 'setState');
			}),
			(C0.prototype.forceUpdate = function (U) {
				this.updater.enqueueForceUpdate(this, U, 'forceUpdate');
			}));
		var W2 = {
			isMounted: [
				'isMounted',
				'Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks.',
			],
			replaceState: [
				'replaceState',
				'Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236).',
			],
		};
		for (e6 in W2) W2.hasOwnProperty(e6) && h(e6, W2[e6]);
		((E0.prototype = C0.prototype),
			(W2 = h0.prototype = new E0()),
			(W2.constructor = h0),
			hB(W2, C0.prototype),
			(W2.isPureReactComponent = !0));
		var V0 = Array.isArray,
			dX = Symbol.for('react.client.reference'),
			r = {
				H: null,
				A: null,
				T: null,
				S: null,
				actQueue: null,
				asyncTransitions: 0,
				isBatchingLegacy: !1,
				didScheduleLegacyUpdate: !1,
				didUsePromise: !1,
				thrownErrors: [],
				getCurrentStack: null,
				recentlyCreatedOwnerStacks: 0,
			},
			b1 = Object.prototype.hasOwnProperty,
			g0 = console.createTask
				? console.createTask
				: function () {
						return null;
					};
		W2 = {
			react_stack_bottom_frame: function (U) {
				return U();
			},
		};
		var P4,
			o5,
			dB = {},
			sB = W2.react_stack_bottom_frame.bind(W2, g)(),
			u9 = g0(I(g)),
			m1 = !1,
			y1 = /\/+/g,
			r6 =
				typeof reportError === 'function'
					? reportError
					: function (U) {
							if (typeof window === 'object' && typeof window.ErrorEvent === 'function') {
								var O = new window.ErrorEvent('error', {
									bubbles: !0,
									cancelable: !0,
									message:
										typeof U === 'object' && U !== null && typeof U.message === 'string'
											? String(U.message)
											: String(U),
									error: U,
								});
								if (!window.dispatchEvent(O)) return;
							} else if (typeof process === 'object' && typeof process.emit === 'function') {
								process.emit('uncaughtException', U);
								return;
							}
							console.error(U);
						},
			x4 = !1,
			lB = null,
			pB = 0,
			cB = !1,
			aB = !1,
			sX =
				typeof queueMicrotask === 'function'
					? function (U) {
							queueMicrotask(function () {
								return queueMicrotask(U);
							});
						}
					: K0;
		W2 = Object.freeze({
			__proto__: null,
			c: function (U) {
				return v().useMemoCache(U);
			},
		});
		var e6 = {
			map: J0,
			forEach: function (U, O, N) {
				J0(
					U,
					function () {
						O.apply(this, arguments);
					},
					N,
				);
			},
			count: function (U) {
				var O = 0;
				return (
					J0(U, function () {
						O++;
					}),
					O
				);
			},
			toArray: function (U) {
				return (
					J0(U, function (O) {
						return O;
					}) || []
				);
			},
			only: function (U) {
				if (!A2(U))
					throw Error('React.Children.only expected to receive a single React element child.');
				return U;
			},
		};
		((Jw.Activity = x6),
			(Jw.Children = e6),
			(Jw.Component = C0),
			(Jw.Fragment = j0),
			(Jw.Profiler = o),
			(Jw.PureComponent = h0),
			(Jw.StrictMode = P),
			(Jw.Suspense = a5),
			(Jw.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = r),
			(Jw.__COMPILER_RUNTIME = W2),
			(Jw.act = function (U) {
				var O = r.actQueue,
					N = pB;
				pB++;
				var C = (r.actQueue = O !== null ? O : []),
					b = !1;
				try {
					var n = U();
				} catch (f) {
					r.thrownErrors.push(f);
				}
				if (0 < r.thrownErrors.length)
					throw (j2(O, N), (U = z0(r.thrownErrors)), (r.thrownErrors.length = 0), U);
				if (n !== null && typeof n === 'object' && typeof n.then === 'function') {
					var i = n;
					return (
						sX(function () {
							b ||
								cB ||
								((cB = !0),
								console.error(
									'You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);',
								));
						}),
						{
							then: function (f, V2) {
								((b = !0),
									i.then(
										function (B5) {
											if ((j2(O, N), N === 0)) {
												try {
													(l(C),
														K0(function () {
															return T(B5, f, V2);
														}));
												} catch (lX) {
													r.thrownErrors.push(lX);
												}
												if (0 < r.thrownErrors.length) {
													var BB = z0(r.thrownErrors);
													((r.thrownErrors.length = 0), V2(BB));
												}
											} else f(B5);
										},
										function (B5) {
											(j2(O, N),
												0 < r.thrownErrors.length
													? ((B5 = z0(r.thrownErrors)), (r.thrownErrors.length = 0), V2(B5))
													: V2(B5));
										},
									));
							},
						}
					);
				}
				var W0 = n;
				if (
					(j2(O, N),
					N === 0 &&
						(l(C),
						C.length !== 0 &&
							sX(function () {
								b ||
									cB ||
									((cB = !0),
									console.error(
										'A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)',
									));
							}),
						(r.actQueue = null)),
					0 < r.thrownErrors.length)
				)
					throw ((U = z0(r.thrownErrors)), (r.thrownErrors.length = 0), U);
				return {
					then: function (f, V2) {
						((b = !0),
							N === 0
								? ((r.actQueue = C),
									K0(function () {
										return T(W0, f, V2);
									}))
								: f(W0));
					},
				};
			}),
			(Jw.cache = function (U) {
				return function () {
					return U.apply(null, arguments);
				};
			}),
			(Jw.cacheSignal = function () {
				return null;
			}),
			(Jw.captureOwnerStack = function () {
				var U = r.getCurrentStack;
				return U === null ? null : U();
			}),
			(Jw.cloneElement = function (U, O, N) {
				if (U === null || U === void 0)
					throw Error('The argument must be a React element, but you passed ' + U + '.');
				var C = hB({}, U.props),
					b = U.key,
					n = U._owner;
				if (O != null) {
					var i;
					B: {
						if (
							b1.call(O, 'ref') &&
							(i = Object.getOwnPropertyDescriptor(O, 'ref').get) &&
							i.isReactWarning
						) {
							i = !1;
							break B;
						}
						i = O.ref !== void 0;
					}
					(i && (n = j()), D0(O) && (I2(O.key), (b = '' + O.key)));
					for (W0 in O)
						!b1.call(O, W0) ||
							W0 === 'key' ||
							W0 === '__self' ||
							W0 === '__source' ||
							(W0 === 'ref' && O.ref === void 0) ||
							(C[W0] = O[W0]);
				}
				var W0 = arguments.length - 2;
				if (W0 === 1) C.children = N;
				else if (1 < W0) {
					i = Array(W0);
					for (var f = 0; f < W0; f++) i[f] = arguments[f + 2];
					C.children = i;
				}
				C = m0(U.type, b, C, n, U._debugStack, U._debugTask);
				for (b = 2; b < arguments.length; b++) r2(arguments[b]);
				return C;
			}),
			(Jw.createContext = function (U) {
				return (
					(U = {
						$$typeof: P0,
						_currentValue: U,
						_currentValue2: U,
						_threadCount: 0,
						Provider: null,
						Consumer: null,
					}),
					(U.Provider = U),
					(U.Consumer = { $$typeof: F0, _context: U }),
					(U._currentRenderer = null),
					(U._currentRenderer2 = null),
					U
				);
			}),
			(Jw.createElement = function (U, O, N) {
				for (var C = 2; C < arguments.length; C++) r2(arguments[C]);
				C = {};
				var b = null;
				if (O != null)
					for (f in (o5 ||
						!('__self' in O) ||
						'key' in O ||
						((o5 = !0),
						console.warn(
							'Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform',
						)),
					D0(O) && (I2(O.key), (b = '' + O.key)),
					O))
						b1.call(O, f) && f !== 'key' && f !== '__self' && f !== '__source' && (C[f] = O[f]);
				var n = arguments.length - 2;
				if (n === 1) C.children = N;
				else if (1 < n) {
					for (var i = Array(n), W0 = 0; W0 < n; W0++) i[W0] = arguments[W0 + 2];
					(Object.freeze && Object.freeze(i), (C.children = i));
				}
				if (U && U.defaultProps)
					for (f in ((n = U.defaultProps), n)) C[f] === void 0 && (C[f] = n[f]);
				b && i2(C, typeof U === 'function' ? U.displayName || U.name || 'Unknown' : U);
				var f = 1e4 > r.recentlyCreatedOwnerStacks++;
				return m0(U, b, C, j(), f ? Error('react-stack-top-frame') : sB, f ? g0(I(U)) : u9);
			}),
			(Jw.createRef = function () {
				var U = { current: null };
				return (Object.seal(U), U);
			}),
			(Jw.forwardRef = function (U) {
				(U != null && U.$$typeof === e2
					? console.error(
							'forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).',
						)
					: typeof U !== 'function'
						? console.error(
								'forwardRef requires a render function but was given %s.',
								U === null ? 'null' : typeof U,
							)
						: U.length !== 0 &&
							U.length !== 2 &&
							console.error(
								'forwardRef render functions accept exactly two parameters: props and ref. %s',
								U.length === 1
									? 'Did you forget to use the ref parameter?'
									: 'Any additional parameter will be undefined.',
							),
					U != null &&
						U.defaultProps != null &&
						console.error(
							'forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?',
						));
				var O = { $$typeof: I0, render: U },
					N;
				return (
					Object.defineProperty(O, 'displayName', {
						enumerable: !1,
						configurable: !0,
						get: function () {
							return N;
						},
						set: function (C) {
							((N = C),
								U.name ||
									U.displayName ||
									(Object.defineProperty(U, 'name', { value: C }), (U.displayName = C)));
						},
					}),
					O
				);
			}),
			(Jw.isValidElement = A2),
			(Jw.lazy = function (U) {
				U = { _status: -1, _result: U };
				var O = { $$typeof: _5, _payload: U, _init: O5 },
					N = {
						name: 'lazy',
						start: -1,
						end: -1,
						value: null,
						owner: null,
						debugStack: Error('react-stack-top-frame'),
						debugTask: console.createTask ? console.createTask('lazy()') : null,
					};
				return ((U._ioInfo = N), (O._debugInfo = [{ awaited: N }]), O);
			}),
			(Jw.memo = function (U, O) {
				(U == null &&
					console.error(
						'memo: The first argument must be a component. Instead received: %s',
						U === null ? 'null' : typeof U,
					),
					(O = { $$typeof: e2, type: U, compare: O === void 0 ? null : O }));
				var N;
				return (
					Object.defineProperty(O, 'displayName', {
						enumerable: !1,
						configurable: !0,
						get: function () {
							return N;
						},
						set: function (C) {
							((N = C),
								U.name ||
									U.displayName ||
									(Object.defineProperty(U, 'name', { value: C }), (U.displayName = C)));
						},
					}),
					O
				);
			}),
			(Jw.startTransition = function (U) {
				var O = r.T,
					N = {};
				((N._updatedFibers = new Set()), (r.T = N));
				try {
					var C = U(),
						b = r.S;
					(b !== null && b(N, C),
						typeof C === 'object' &&
							C !== null &&
							typeof C.then === 'function' &&
							(r.asyncTransitions++, C.then(G2, G2), C.then(X2, r6)));
				} catch (n) {
					r6(n);
				} finally {
					(O === null &&
						N._updatedFibers &&
						((U = N._updatedFibers.size),
						N._updatedFibers.clear(),
						10 < U &&
							console.warn(
								'Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.',
							)),
						O !== null &&
							N.types !== null &&
							(O.types !== null &&
								O.types !== N.types &&
								console.error(
									'We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React.',
								),
							(O.types = N.types)),
						(r.T = O));
				}
			}),
			(Jw.unstable_useCacheRefresh = function () {
				return v().useCacheRefresh();
			}),
			(Jw.use = function (U) {
				return v().use(U);
			}),
			(Jw.useActionState = function (U, O, N) {
				return v().useActionState(U, O, N);
			}),
			(Jw.useCallback = function (U, O) {
				return v().useCallback(U, O);
			}),
			(Jw.useContext = function (U) {
				var O = v();
				return (
					U.$$typeof === F0 &&
						console.error(
							'Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?',
						),
					O.useContext(U)
				);
			}),
			(Jw.useDebugValue = function (U, O) {
				return v().useDebugValue(U, O);
			}),
			(Jw.useDeferredValue = function (U, O) {
				return v().useDeferredValue(U, O);
			}),
			(Jw.useEffect = function (U, O) {
				return (
					U == null &&
						console.warn(
							'React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?',
						),
					v().useEffect(U, O)
				);
			}),
			(Jw.useEffectEvent = function (U) {
				return v().useEffectEvent(U);
			}),
			(Jw.useId = function () {
				return v().useId();
			}),
			(Jw.useImperativeHandle = function (U, O, N) {
				return v().useImperativeHandle(U, O, N);
			}),
			(Jw.useInsertionEffect = function (U, O) {
				return (
					U == null &&
						console.warn(
							'React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?',
						),
					v().useInsertionEffect(U, O)
				);
			}),
			(Jw.useLayoutEffect = function (U, O) {
				return (
					U == null &&
						console.warn(
							'React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?',
						),
					v().useLayoutEffect(U, O)
				);
			}),
			(Jw.useMemo = function (U, O) {
				return v().useMemo(U, O);
			}),
			(Jw.useOptimistic = function (U, O) {
				return v().useOptimistic(U, O);
			}),
			(Jw.useReducer = function (U, O, N) {
				return v().useReducer(U, O, N);
			}),
			(Jw.useRef = function (U) {
				return v().useRef(U);
			}),
			(Jw.useState = function (U) {
				return v().useState(U);
			}),
			(Jw.useSyncExternalStore = function (U, O, N) {
				return v().useSyncExternalStore(U, O, N);
			}),
			(Jw.useTransition = function () {
				return v().useTransition();
			}),
			(Jw.version = '19.2.8'),
			typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === 'function' &&
				__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error()));
	})();
});
var zQ = v1((Uw) => {
	(function () {
		function h() {
			if (((p5 = !1), J0)) {
				var T = Uw.unstable_now();
				G2 = T;
				var l = !0;
				try {
					B: {
						((r2 = !1), A2 && ((A2 = !1), P6(O5), (O5 = -1)), (t2 = !0));
						var d = m0;
						try {
							X: {
								h0(T);
								for (p0 = O0(g); p0 !== null && !(p0.expirationTime > T && E());) {
									var A0 = p0.callback;
									if (typeof A0 === 'function') {
										((p0.callback = null), (m0 = p0.priorityLevel));
										var j0 = A0(p0.expirationTime <= T);
										if (((T = Uw.unstable_now()), typeof j0 === 'function')) {
											((p0.callback = j0), h0(T), (l = !0));
											break X;
										}
										(p0 === O0(g) && C0(g), h0(T));
									} else C0(g);
									p0 = O0(g);
								}
								if (p0 !== null) l = !0;
								else {
									var P = O0(D0);
									(P !== null && I2(X2, P.startTime - T), (l = !1));
								}
							}
							break B;
						} finally {
							((p0 = null), (m0 = d), (t2 = !1));
						}
						l = void 0;
					}
				} finally {
					l ? K0() : (J0 = !1);
				}
			}
		}
		function q0(T, l) {
			var d = T.length;
			T.push(l);
			B: for (; 0 < d;) {
				var A0 = (d - 1) >>> 1,
					j0 = T[A0];
				if (0 < E0(j0, l)) ((T[A0] = l), (T[d] = j0), (d = A0));
				else break B;
			}
		}
		function O0(T) {
			return T.length === 0 ? null : T[0];
		}
		function C0(T) {
			if (T.length === 0) return null;
			var l = T[0],
				d = T.pop();
			if (d !== l) {
				T[0] = d;
				B: for (var A0 = 0, j0 = T.length, P = j0 >>> 1; A0 < P;) {
					var o = 2 * (A0 + 1) - 1,
						F0 = T[o],
						P0 = o + 1,
						I0 = T[P0];
					if (0 > E0(F0, d))
						P0 < j0 && 0 > E0(I0, F0)
							? ((T[A0] = I0), (T[P0] = d), (A0 = P0))
							: ((T[A0] = F0), (T[o] = d), (A0 = o));
					else if (P0 < j0 && 0 > E0(I0, d)) ((T[A0] = I0), (T[P0] = d), (A0 = P0));
					else break B;
				}
			}
			return l;
		}
		function E0(T, l) {
			var d = T.sortIndex - l.sortIndex;
			return d !== 0 ? d : T.id - l.id;
		}
		function h0(T) {
			for (var l = O0(D0); l !== null;) {
				if (l.callback === null) C0(D0);
				else if (l.startTime <= T) (C0(D0), (l.sortIndex = l.expirationTime), q0(g, l));
				else break;
				l = O0(D0);
			}
		}
		function X2(T) {
			if (((A2 = !1), h0(T), !r2))
				if (O0(g) !== null) ((r2 = !0), J0 || ((J0 = !0), K0()));
				else {
					var l = O0(D0);
					l !== null && I2(X2, l.startTime - T);
				}
		}
		function E() {
			return p5 ? !0 : Uw.unstable_now() - G2 < v ? !1 : !0;
		}
		function I2(T, l) {
			O5 = c5(function () {
				T(Uw.unstable_now());
			}, l);
		}
		if (
			(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === 'function' &&
				__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error()),
			(Uw.unstable_now = void 0),
			typeof performance === 'object' && typeof performance.now === 'function')
		) {
			var v2 = performance;
			Uw.unstable_now = function () {
				return v2.now();
			};
		} else {
			var I = Date,
				j = I.now();
			Uw.unstable_now = function () {
				return I.now() - j;
			};
		}
		var g = [],
			D0 = [],
			i2 = 1,
			p0 = null,
			m0 = 3,
			t2 = !1,
			r2 = !1,
			A2 = !1,
			p5 = !1,
			c5 = typeof setTimeout === 'function' ? setTimeout : null,
			P6 = typeof clearTimeout === 'function' ? clearTimeout : null,
			U2 = typeof setImmediate < 'u' ? setImmediate : null,
			J0 = !1,
			O5 = -1,
			v = 5,
			G2 = -1;
		if (typeof U2 === 'function')
			var K0 = function () {
				U2(h);
			};
		else if (typeof MessageChannel < 'u') {
			var z0 = new MessageChannel(),
				j2 = z0.port2;
			((z0.port1.onmessage = h),
				(K0 = function () {
					j2.postMessage(null);
				}));
		} else
			K0 = function () {
				c5(h, 0);
			};
		((Uw.unstable_IdlePriority = 5),
			(Uw.unstable_ImmediatePriority = 1),
			(Uw.unstable_LowPriority = 4),
			(Uw.unstable_NormalPriority = 3),
			(Uw.unstable_Profiling = null),
			(Uw.unstable_UserBlockingPriority = 2),
			(Uw.unstable_cancelCallback = function (T) {
				T.callback = null;
			}),
			(Uw.unstable_forceFrameRate = function (T) {
				0 > T || 125 < T
					? console.error(
							'forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported',
						)
					: (v = 0 < T ? Math.floor(1000 / T) : 5);
			}),
			(Uw.unstable_getCurrentPriorityLevel = function () {
				return m0;
			}),
			(Uw.unstable_next = function (T) {
				switch (m0) {
					case 1:
					case 2:
					case 3:
						var l = 3;
						break;
					default:
						l = m0;
				}
				var d = m0;
				m0 = l;
				try {
					return T();
				} finally {
					m0 = d;
				}
			}),
			(Uw.unstable_requestPaint = function () {
				p5 = !0;
			}),
			(Uw.unstable_runWithPriority = function (T, l) {
				switch (T) {
					case 1:
					case 2:
					case 3:
					case 4:
					case 5:
						break;
					default:
						T = 3;
				}
				var d = m0;
				m0 = T;
				try {
					return l();
				} finally {
					m0 = d;
				}
			}),
			(Uw.unstable_scheduleCallback = function (T, l, d) {
				var A0 = Uw.unstable_now();
				switch (
					(typeof d === 'object' && d !== null
						? ((d = d.delay), (d = typeof d === 'number' && 0 < d ? A0 + d : A0))
						: (d = A0),
					T)
				) {
					case 1:
						var j0 = -1;
						break;
					case 2:
						j0 = 250;
						break;
					case 5:
						j0 = 1073741823;
						break;
					case 4:
						j0 = 1e4;
						break;
					default:
						j0 = 5000;
				}
				return (
					(j0 = d + j0),
					(T = {
						id: i2++,
						callback: l,
						priorityLevel: T,
						startTime: d,
						expirationTime: j0,
						sortIndex: -1,
					}),
					d > A0
						? ((T.sortIndex = d),
							q0(D0, T),
							O0(g) === null &&
								T === O0(D0) &&
								(A2 ? (P6(O5), (O5 = -1)) : (A2 = !0), I2(X2, d - A0)))
						: ((T.sortIndex = j0), q0(g, T), r2 || t2 || ((r2 = !0), J0 || ((J0 = !0), K0()))),
					T
				);
			}),
			(Uw.unstable_shouldYield = E),
			(Uw.unstable_wrapCallback = function (T) {
				var l = m0;
				return function () {
					var d = m0;
					m0 = l;
					try {
						return T.apply(this, arguments);
					} finally {
						m0 = d;
					}
				};
			}),
			typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === 'function' &&
				__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error()));
	})();
});
var HQ = v1((Qw) => {
	var AY = n2(uX());
	(function () {
		function h() {}
		function q0(I) {
			return '' + I;
		}
		function O0(I, j, g) {
			var D0 = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
			try {
				q0(D0);
				var i2 = !1;
			} catch (p0) {
				i2 = !0;
			}
			return (
				i2 &&
					(console.error(
						'The provided key is an unsupported type %s. This value must be coerced to a string before using it here.',
						(typeof Symbol === 'function' && Symbol.toStringTag && D0[Symbol.toStringTag]) ||
							D0.constructor.name ||
							'Object',
					),
					q0(D0)),
				{
					$$typeof: I2,
					key: D0 == null ? null : '' + D0,
					children: I,
					containerInfo: j,
					implementation: g,
				}
			);
		}
		function C0(I, j) {
			if (I === 'font') return '';
			if (typeof j === 'string') return j === 'use-credentials' ? j : '';
		}
		function E0(I) {
			return I === null
				? '`null`'
				: I === void 0
					? '`undefined`'
					: I === ''
						? 'an empty string'
						: 'something with type "' + typeof I + '"';
		}
		function h0(I) {
			return I === null
				? '`null`'
				: I === void 0
					? '`undefined`'
					: I === ''
						? 'an empty string'
						: typeof I === 'string'
							? JSON.stringify(I)
							: typeof I === 'number'
								? '`' + I + '`'
								: 'something with type "' + typeof I + '"';
		}
		function X2() {
			var I = v2.H;
			return (
				I === null &&
					console.error(`Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`),
				I
			);
		}
		typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
			typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === 'function' &&
			__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var E = {
				d: {
					f: h,
					r: function () {
						throw Error(
							'Invalid form element. requestFormReset must be passed a form that was rendered by React.',
						);
					},
					D: h,
					C: h,
					L: h,
					m: h,
					X: h,
					S: h,
					M: h,
				},
				p: 0,
				findDOMNode: null,
			},
			I2 = Symbol.for('react.portal'),
			v2 = AY.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
		((typeof Map === 'function' &&
			Map.prototype != null &&
			typeof Map.prototype.forEach === 'function' &&
			typeof Set === 'function' &&
			Set.prototype != null &&
			typeof Set.prototype.clear === 'function' &&
			typeof Set.prototype.forEach === 'function') ||
			console.error(
				'React depends on Map and Set built-in types. Make sure that you load a polyfill in older browsers. https://reactjs.org/link/react-polyfills',
			),
			(Qw.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = E),
			(Qw.createPortal = function (I, j) {
				var g = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
				if (!j || (j.nodeType !== 1 && j.nodeType !== 9 && j.nodeType !== 11))
					throw Error('Target container is not a DOM element.');
				return O0(I, j, null, g);
			}),
			(Qw.flushSync = function (I) {
				var j = v2.T,
					g = E.p;
				try {
					if (((v2.T = null), (E.p = 2), I)) return I();
				} finally {
					((v2.T = j),
						(E.p = g),
						E.d.f() &&
							console.error(
								'flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering. Consider moving this call to a scheduler task or micro task.',
							));
				}
			}),
			(Qw.preconnect = function (I, j) {
				(typeof I === 'string' && I
					? j != null && typeof j !== 'object'
						? console.error(
								'ReactDOM.preconnect(): Expected the `options` argument (second) to be an object but encountered %s instead. The only supported option at this time is `crossOrigin` which accepts a string.',
								h0(j),
							)
						: j != null &&
							typeof j.crossOrigin !== 'string' &&
							console.error(
								'ReactDOM.preconnect(): Expected the `crossOrigin` option (second argument) to be a string but encountered %s instead. Try removing this option or passing a string value instead.',
								E0(j.crossOrigin),
							)
					: console.error(
							'ReactDOM.preconnect(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.',
							E0(I),
						),
					typeof I === 'string' &&
						(j
							? ((j = j.crossOrigin),
								(j = typeof j === 'string' ? (j === 'use-credentials' ? j : '') : void 0))
							: (j = null),
						E.d.C(I, j)));
			}),
			(Qw.prefetchDNS = function (I) {
				if (typeof I !== 'string' || !I)
					console.error(
						'ReactDOM.prefetchDNS(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.',
						E0(I),
					);
				else if (1 < arguments.length) {
					var j = arguments[1];
					typeof j === 'object' && j.hasOwnProperty('crossOrigin')
						? console.error(
								'ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. It looks like the you are attempting to set a crossOrigin property for this DNS lookup hint. Browsers do not perform DNS queries using CORS and setting this attribute on the resource hint has no effect. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.',
								h0(j),
							)
						: console.error(
								'ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.',
								h0(j),
							);
				}
				typeof I === 'string' && E.d.D(I);
			}),
			(Qw.preinit = function (I, j) {
				if (
					(typeof I === 'string' && I
						? j == null || typeof j !== 'object'
							? console.error(
									'ReactDOM.preinit(): Expected the `options` argument (second) to be an object with an `as` property describing the type of resource to be preinitialized but encountered %s instead.',
									h0(j),
								)
							: j.as !== 'style' &&
								j.as !== 'script' &&
								console.error(
									'ReactDOM.preinit(): Expected the `as` property in the `options` argument (second) to contain a valid value describing the type of resource to be preinitialized but encountered %s instead. Valid values for `as` are "style" and "script".',
									h0(j.as),
								)
						: console.error(
								'ReactDOM.preinit(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.',
								E0(I),
							),
					typeof I === 'string' && j && typeof j.as === 'string')
				) {
					var g = j.as,
						D0 = C0(g, j.crossOrigin),
						i2 = typeof j.integrity === 'string' ? j.integrity : void 0,
						p0 = typeof j.fetchPriority === 'string' ? j.fetchPriority : void 0;
					g === 'style'
						? E.d.S(I, typeof j.precedence === 'string' ? j.precedence : void 0, {
								crossOrigin: D0,
								integrity: i2,
								fetchPriority: p0,
							})
						: g === 'script' &&
							E.d.X(I, {
								crossOrigin: D0,
								integrity: i2,
								fetchPriority: p0,
								nonce: typeof j.nonce === 'string' ? j.nonce : void 0,
							});
				}
			}),
			(Qw.preinitModule = function (I, j) {
				var g = '';
				if (
					((typeof I === 'string' && I) ||
						(g += ' The `href` argument encountered was ' + E0(I) + '.'),
					j !== void 0 && typeof j !== 'object'
						? (g += ' The `options` argument encountered was ' + E0(j) + '.')
						: j &&
							'as' in j &&
							j.as !== 'script' &&
							(g += ' The `as` option encountered was ' + h0(j.as) + '.'),
					g)
				)
					console.error(
						'ReactDOM.preinitModule(): Expected up to two arguments, a non-empty `href` string and, optionally, an `options` object with a valid `as` property.%s',
						g,
					);
				else
					switch (((g = j && typeof j.as === 'string' ? j.as : 'script'), g)) {
						case 'script':
							break;
						default:
							((g = h0(g)),
								console.error(
									'ReactDOM.preinitModule(): Currently the only supported "as" type for this function is "script" but received "%s" instead. This warning was generated for `href` "%s". In the future other module types will be supported, aligning with the import-attributes proposal. Learn more here: (https://github.com/tc39/proposal-import-attributes)',
									g,
									I,
								));
					}
				if (typeof I === 'string')
					if (typeof j === 'object' && j !== null) {
						if (j.as == null || j.as === 'script')
							((g = C0(j.as, j.crossOrigin)),
								E.d.M(I, {
									crossOrigin: g,
									integrity: typeof j.integrity === 'string' ? j.integrity : void 0,
									nonce: typeof j.nonce === 'string' ? j.nonce : void 0,
								}));
					} else j == null && E.d.M(I);
			}),
			(Qw.preload = function (I, j) {
				var g = '';
				if (
					((typeof I === 'string' && I) ||
						(g += ' The `href` argument encountered was ' + E0(I) + '.'),
					j == null || typeof j !== 'object'
						? (g += ' The `options` argument encountered was ' + E0(j) + '.')
						: (typeof j.as === 'string' && j.as) ||
							(g += ' The `as` option encountered was ' + E0(j.as) + '.'),
					g &&
						console.error(
							'ReactDOM.preload(): Expected two arguments, a non-empty `href` string and an `options` object with an `as` property valid for a `<link rel="preload" as="..." />` tag.%s',
							g,
						),
					typeof I === 'string' && typeof j === 'object' && j !== null && typeof j.as === 'string')
				) {
					g = j.as;
					var D0 = C0(g, j.crossOrigin);
					E.d.L(I, g, {
						crossOrigin: D0,
						integrity: typeof j.integrity === 'string' ? j.integrity : void 0,
						nonce: typeof j.nonce === 'string' ? j.nonce : void 0,
						type: typeof j.type === 'string' ? j.type : void 0,
						fetchPriority: typeof j.fetchPriority === 'string' ? j.fetchPriority : void 0,
						referrerPolicy: typeof j.referrerPolicy === 'string' ? j.referrerPolicy : void 0,
						imageSrcSet: typeof j.imageSrcSet === 'string' ? j.imageSrcSet : void 0,
						imageSizes: typeof j.imageSizes === 'string' ? j.imageSizes : void 0,
						media: typeof j.media === 'string' ? j.media : void 0,
					});
				}
			}),
			(Qw.preloadModule = function (I, j) {
				var g = '';
				((typeof I === 'string' && I) ||
					(g += ' The `href` argument encountered was ' + E0(I) + '.'),
					j !== void 0 && typeof j !== 'object'
						? (g += ' The `options` argument encountered was ' + E0(j) + '.')
						: j &&
							'as' in j &&
							typeof j.as !== 'string' &&
							(g += ' The `as` option encountered was ' + E0(j.as) + '.'),
					g &&
						console.error(
							'ReactDOM.preloadModule(): Expected two arguments, a non-empty `href` string and, optionally, an `options` object with an `as` property valid for a `<link rel="modulepreload" as="..." />` tag.%s',
							g,
						),
					typeof I === 'string' &&
						(j
							? ((g = C0(j.as, j.crossOrigin)),
								E.d.m(I, {
									as: typeof j.as === 'string' && j.as !== 'script' ? j.as : void 0,
									crossOrigin: g,
									integrity: typeof j.integrity === 'string' ? j.integrity : void 0,
								}))
							: E.d.m(I)));
			}),
			(Qw.requestFormReset = function (I) {
				E.d.r(I);
			}),
			(Qw.unstable_batchedUpdates = function (I, j) {
				return I(j);
			}),
			(Qw.useFormState = function (I, j, g) {
				return X2().useFormState(I, j, g);
			}),
			(Qw.useFormStatus = function () {
				return X2().useHostTransitionStatus();
			}),
			(Qw.version = '19.2.8'),
			typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === 'function' &&
				__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error()));
	})();
});
var UQ = v1((uK, JQ) => {
	var Mw = n2(HQ());
	JQ.exports = Mw;
});
var QQ = v1((qw) => {
	var w0 = n2(zQ()),
		hX = n2(uX()),
		jY = n2(UQ());
	(function () {
		function h(B, X) {
			for (B = B.memoizedState; B !== null && 0 < X;) ((B = B.next), X--);
			return B;
		}
		function q0(B, X, G, Z) {
			if (G >= X.length) return Z;
			var Y = X[G],
				$ = Q2(B) ? B.slice() : Y0({}, B);
			return (($[Y] = q0(B[Y], X, G + 1, Z)), $);
		}
		function O0(B, X, G) {
			if (X.length !== G.length) console.warn('copyWithRename() expects paths of the same length');
			else {
				for (var Z = 0; Z < G.length - 1; Z++)
					if (X[Z] !== G[Z]) {
						console.warn(
							'copyWithRename() expects paths to be the same except for the deepest key',
						);
						return;
					}
				return C0(B, X, G, 0);
			}
		}
		function C0(B, X, G, Z) {
			var Y = X[Z],
				$ = Q2(B) ? B.slice() : Y0({}, B);
			return (
				Z + 1 === X.length
					? (($[G[Z]] = $[Y]), Q2($) ? $.splice(Y, 1) : delete $[Y])
					: ($[Y] = C0(B[Y], X, G, Z + 1)),
				$
			);
		}
		function E0(B, X, G) {
			var Z = X[G],
				Y = Q2(B) ? B.slice() : Y0({}, B);
			if (G + 1 === X.length) return (Q2(Y) ? Y.splice(Z, 1) : delete Y[Z], Y);
			return ((Y[Z] = E0(B[Z], X, G + 1)), Y);
		}
		function h0() {
			return !1;
		}
		function X2() {
			return null;
		}
		function E() {
			console.error(
				'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks',
			);
		}
		function I2() {
			console.error(
				'Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().',
			);
		}
		function v2() {}
		function I() {}
		function j(B) {
			var X = [];
			return (
				B.forEach(function (G) {
					X.push(G);
				}),
				X.sort().join(', ')
			);
		}
		function g(B, X, G, Z) {
			return new pQ(B, X, G, Z);
		}
		function D0(B, X) {
			B.context === AB && (u8(B.current, 2, X, B, null, null), t1());
		}
		function i2(B, X) {
			if (x5 !== null) {
				var G = X.staleFamilies;
				((X = X.updatedFamilies), K3(), M$(B.current, X, G), t1());
			}
		}
		function p0(B) {
			x5 = B;
		}
		function m0(B) {
			return !(!B || (B.nodeType !== 1 && B.nodeType !== 9 && B.nodeType !== 11));
		}
		function t2(B) {
			var X = B,
				G = B;
			if (B.alternate) for (; X.return;) X = X.return;
			else {
				B = X;
				do ((X = B), (X.flags & 4098) !== 0 && (G = X.return), (B = X.return));
				while (B);
			}
			return X.tag === 3 ? G : null;
		}
		function r2(B) {
			if (B.tag === 13) {
				var X = B.memoizedState;
				if ((X === null && ((B = B.alternate), B !== null && (X = B.memoizedState)), X !== null))
					return X.dehydrated;
			}
			return null;
		}
		function A2(B) {
			if (B.tag === 31) {
				var X = B.memoizedState;
				if ((X === null && ((B = B.alternate), B !== null && (X = B.memoizedState)), X !== null))
					return X.dehydrated;
			}
			return null;
		}
		function p5(B) {
			if (t2(B) !== B) throw Error('Unable to find node on an unmounted component.');
		}
		function c5(B) {
			var X = B.alternate;
			if (!X) {
				if (((X = t2(B)), X === null))
					throw Error('Unable to find node on an unmounted component.');
				return X !== B ? null : B;
			}
			for (var G = B, Z = X; ;) {
				var Y = G.return;
				if (Y === null) break;
				var $ = Y.alternate;
				if ($ === null) {
					if (((Z = Y.return), Z !== null)) {
						G = Z;
						continue;
					}
					break;
				}
				if (Y.child === $.child) {
					for ($ = Y.child; $;) {
						if ($ === G) return (p5(Y), B);
						if ($ === Z) return (p5(Y), X);
						$ = $.sibling;
					}
					throw Error('Unable to find node on an unmounted component.');
				}
				if (G.return !== Z.return) ((G = Y), (Z = $));
				else {
					for (var R = !1, z = Y.child; z;) {
						if (z === G) {
							((R = !0), (G = Y), (Z = $));
							break;
						}
						if (z === Z) {
							((R = !0), (Z = Y), (G = $));
							break;
						}
						z = z.sibling;
					}
					if (!R) {
						for (z = $.child; z;) {
							if (z === G) {
								((R = !0), (G = $), (Z = Y));
								break;
							}
							if (z === Z) {
								((R = !0), (Z = $), (G = Y));
								break;
							}
							z = z.sibling;
						}
						if (!R)
							throw Error(
								'Child was not found in either parent set. This indicates a bug in React related to the return pointer. Please file an issue.',
							);
					}
				}
				if (G.alternate !== Z)
					throw Error(
						"Return fibers should always be each others' alternates. This error is likely caused by a bug in React. Please file an issue.",
					);
			}
			if (G.tag !== 3) throw Error('Unable to find node on an unmounted component.');
			return G.stateNode.current === G ? B : X;
		}
		function P6(B) {
			var X = B.tag;
			if (X === 5 || X === 26 || X === 27 || X === 6) return B;
			for (B = B.child; B !== null;) {
				if (((X = P6(B)), X !== null)) return X;
				B = B.sibling;
			}
			return null;
		}
		function U2(B) {
			if (B === null || typeof B !== 'object') return null;
			return ((B = (LH && B[LH]) || B['@@iterator']), typeof B === 'function' ? B : null);
		}
		function J0(B) {
			if (B == null) return null;
			if (typeof B === 'function')
				return B.$$typeof === Mq ? null : B.displayName || B.name || null;
			if (typeof B === 'string') return B;
			switch (B) {
				case YX:
					return 'Fragment';
				case c8:
					return 'Profiler';
				case S7:
					return 'StrictMode';
				case o8:
					return 'Suspense';
				case n8:
					return 'SuspenseList';
				case i8:
					return 'Activity';
			}
			if (typeof B === 'object')
				switch (
					(typeof B.tag === 'number' &&
						console.error(
							'Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.',
						),
					B.$$typeof)
				) {
					case ZX:
						return 'Portal';
					case M6:
						return B.displayName || 'Context';
					case a8:
						return (B._context.displayName || 'Context') + '.Consumer';
					case E3:
						var X = B.render;
						return (
							(B = B.displayName),
							B ||
								((B = X.displayName || X.name || ''),
								(B = B !== '' ? 'ForwardRef(' + B + ')' : 'ForwardRef')),
							B
						);
					case g7:
						return ((X = B.displayName || null), X !== null ? X : J0(B.type) || 'Memo');
					case J5:
						((X = B._payload), (B = B._init));
						try {
							return J0(B(X));
						} catch (G) {}
				}
			return null;
		}
		function O5(B) {
			return typeof B.tag === 'number' ? v(B) : typeof B.name === 'string' ? B.name : null;
		}
		function v(B) {
			var X = B.type;
			switch (B.tag) {
				case 31:
					return 'Activity';
				case 24:
					return 'Cache';
				case 9:
					return (X._context.displayName || 'Context') + '.Consumer';
				case 10:
					return X.displayName || 'Context';
				case 18:
					return 'DehydratedFragment';
				case 11:
					return (
						(B = X.render),
						(B = B.displayName || B.name || ''),
						X.displayName || (B !== '' ? 'ForwardRef(' + B + ')' : 'ForwardRef')
					);
				case 7:
					return 'Fragment';
				case 26:
				case 27:
				case 5:
					return X;
				case 4:
					return 'Portal';
				case 3:
					return 'Root';
				case 6:
					return 'Text';
				case 16:
					return J0(X);
				case 8:
					return X === S7 ? 'StrictMode' : 'Mode';
				case 22:
					return 'Offscreen';
				case 12:
					return 'Profiler';
				case 21:
					return 'Scope';
				case 13:
					return 'Suspense';
				case 19:
					return 'SuspenseList';
				case 25:
					return 'TracingMarker';
				case 1:
				case 0:
				case 14:
				case 15:
					if (typeof X === 'function') return X.displayName || X.name || null;
					if (typeof X === 'string') return X;
					break;
				case 29:
					if (((X = B._debugInfo), X != null)) {
						for (var G = X.length - 1; 0 <= G; G--)
							if (typeof X[G].name === 'string') return X[G].name;
					}
					if (B.return !== null) return v(B.return);
			}
			return null;
		}
		function G2(B) {
			return { current: B };
		}
		function K0(B, X) {
			0 > g6
				? console.error('Unexpected pop.')
				: (X !== r8[g6] && console.error('Unexpected Fiber popped.'),
					(B.current = t8[g6]),
					(t8[g6] = null),
					(r8[g6] = null),
					g6--);
		}
		function z0(B, X, G) {
			(g6++, (t8[g6] = B.current), (r8[g6] = G), (B.current = X));
		}
		function j2(B) {
			return (
				B === null &&
					console.error(
						'Expected host context to exist. This error is likely caused by a bug in React. Please file an issue.',
					),
				B
			);
		}
		function T(B, X) {
			(z0(WB, X, B), z0(I3, B, B), z0(qB, null, B));
			var G = X.nodeType;
			switch (G) {
				case 9:
				case 11:
					((G = G === 9 ? '#document' : '#fragment'),
						(X = (X = X.documentElement) ? ((X = X.namespaceURI) ? sz(X) : o6) : o6));
					break;
				default:
					if (((G = X.tagName), (X = X.namespaceURI))) ((X = sz(X)), (X = lz(X, G)));
					else
						switch (G) {
							case 'svg':
								X = yX;
								break;
							case 'math':
								X = v9;
								break;
							default:
								X = o6;
						}
			}
			((G = G.toLowerCase()),
				(G = mY(null, G)),
				(G = { context: X, ancestorInfo: G }),
				K0(qB, B),
				z0(qB, G, B));
		}
		function l(B) {
			(K0(qB, B), K0(I3, B), K0(WB, B));
		}
		function d() {
			return j2(qB.current);
		}
		function A0(B) {
			B.memoizedState !== null && z0(k7, B, B);
			var X = j2(qB.current),
				G = B.type,
				Z = lz(X.context, G);
			((G = mY(X.ancestorInfo, G)),
				(Z = { context: Z, ancestorInfo: G }),
				X !== Z && (z0(I3, B, B), z0(qB, Z, B)));
		}
		function j0(B) {
			(I3.current === B && (K0(qB, B), K0(I3, B)),
				k7.current === B && (K0(k7, B), (_4._currentValue = T1)));
		}
		function P() {}
		function o() {
			if (V3 === 0) {
				((AH = console.log),
					(jH = console.info),
					(FH = console.warn),
					(PH = console.error),
					(xH = console.group),
					(NH = console.groupCollapsed),
					(EH = console.groupEnd));
				var B = { configurable: !0, enumerable: !0, value: P, writable: !0 };
				Object.defineProperties(console, {
					info: B,
					log: B,
					warn: B,
					error: B,
					group: B,
					groupCollapsed: B,
					groupEnd: B,
				});
			}
			V3++;
		}
		function F0() {
			if ((V3--, V3 === 0)) {
				var B = { configurable: !0, enumerable: !0, writable: !0 };
				Object.defineProperties(console, {
					log: Y0({}, B, { value: AH }),
					info: Y0({}, B, { value: jH }),
					warn: Y0({}, B, { value: FH }),
					error: Y0({}, B, { value: PH }),
					group: Y0({}, B, { value: xH }),
					groupCollapsed: Y0({}, B, { value: NH }),
					groupEnd: Y0({}, B, { value: EH }),
				});
			}
			0 > V3 &&
				console.error(
					'disabledDepth fell below zero. This is a bug in React. Please file an issue.',
				);
		}
		function P0(B) {
			var X = Error.prepareStackTrace;
			if (
				((Error.prepareStackTrace = void 0),
				(B = B.stack),
				(Error.prepareStackTrace = X),
				B.startsWith(`Error: react-stack-top-frame
`) && (B = B.slice(29)),
				(X = B.indexOf(`
`)),
				X !== -1 && (B = B.slice(X + 1)),
				(X = B.indexOf('react_stack_bottom_frame')),
				X !== -1 &&
					(X = B.lastIndexOf(
						`
`,
						X,
					)),
				X !== -1)
			)
				B = B.slice(0, X);
			else return '';
			return B;
		}
		function I0(B) {
			if (e8 === void 0)
				try {
					throw Error();
				} catch (G) {
					var X = G.stack.trim().match(/\n( *(at )?)/);
					((e8 = (X && X[1]) || ''),
						(IH =
							-1 <
							G.stack.indexOf(`
    at`)
								? ' (<anonymous>)'
								: -1 < G.stack.indexOf('@')
									? '@unknown:0:0'
									: ''));
				}
			return (
				`
` +
				e8 +
				B +
				IH
			);
		}
		function a5(B, X) {
			if (!B || BZ) return '';
			var G = XZ.get(B);
			if (G !== void 0) return G;
			((BZ = !0), (G = Error.prepareStackTrace), (Error.prepareStackTrace = void 0));
			var Z = null;
			((Z = A.H), (A.H = null), o());
			try {
				var Y = {
					DetermineComponentFrameRoot: function () {
						try {
							if (X) {
								var M = function () {
									throw Error();
								};
								if (
									(Object.defineProperty(M.prototype, 'props', {
										set: function () {
											throw Error();
										},
									}),
									typeof Reflect === 'object' && Reflect.construct)
								) {
									try {
										Reflect.construct(M, []);
									} catch (V) {
										var _ = V;
									}
									Reflect.construct(B, [], M);
								} else {
									try {
										M.call();
									} catch (V) {
										_ = V;
									}
									B.call(M.prototype);
								}
							} else {
								try {
									throw Error();
								} catch (V) {
									_ = V;
								}
								(M = B()) && typeof M.catch === 'function' && M.catch(function () {});
							}
						} catch (V) {
							if (V && _ && typeof V.stack === 'string') return [V.stack, _.stack];
						}
						return [null, null];
					},
				};
				Y.DetermineComponentFrameRoot.displayName = 'DetermineComponentFrameRoot';
				var $ = Object.getOwnPropertyDescriptor(Y.DetermineComponentFrameRoot, 'name');
				$ &&
					$.configurable &&
					Object.defineProperty(Y.DetermineComponentFrameRoot, 'name', {
						value: 'DetermineComponentFrameRoot',
					});
				var R = Y.DetermineComponentFrameRoot(),
					z = R[0],
					H = R[1];
				if (z && H) {
					var J = z.split(`
`),
						w = H.split(`
`);
					for (R = $ = 0; $ < J.length && !J[$].includes('DetermineComponentFrameRoot');) $++;
					for (; R < w.length && !w[R].includes('DetermineComponentFrameRoot');) R++;
					if ($ === J.length || R === w.length)
						for ($ = J.length - 1, R = w.length - 1; 1 <= $ && 0 <= R && J[$] !== w[R];) R--;
					for (; 1 <= $ && 0 <= R; $--, R--)
						if (J[$] !== w[R]) {
							if ($ !== 1 || R !== 1)
								do
									if (($--, R--, 0 > R || J[$] !== w[R])) {
										var K =
											`
` + J[$].replace(' at new ', ' at ');
										return (
											B.displayName &&
												K.includes('<anonymous>') &&
												(K = K.replace('<anonymous>', B.displayName)),
											typeof B === 'function' && XZ.set(B, K),
											K
										);
									}
								while (1 <= $ && 0 <= R);
							break;
						}
				}
			} finally {
				((BZ = !1), (A.H = Z), F0(), (Error.prepareStackTrace = G));
			}
			return (
				(J = (J = B ? B.displayName || B.name : '') ? I0(J) : ''),
				typeof B === 'function' && XZ.set(B, J),
				J
			);
		}
		function o0(B, X) {
			switch (B.tag) {
				case 26:
				case 27:
				case 5:
					return I0(B.type);
				case 16:
					return I0('Lazy');
				case 13:
					return B.child !== X && X !== null ? I0('Suspense Fallback') : I0('Suspense');
				case 19:
					return I0('SuspenseList');
				case 0:
				case 15:
					return a5(B.type, !1);
				case 11:
					return a5(B.type.render, !1);
				case 1:
					return a5(B.type, !0);
				case 31:
					return I0('Activity');
				default:
					return '';
			}
		}
		function e2(B) {
			try {
				var X = '',
					G = null;
				do {
					X += o0(B, G);
					var Z = B._debugInfo;
					if (Z)
						for (var Y = Z.length - 1; 0 <= Y; Y--) {
							var $ = Z[Y];
							if (typeof $.name === 'string') {
								var R = X;
								B: {
									var { name: z, env: H, debugLocation: J } = $;
									if (J != null) {
										var w = P0(J),
											K = w.lastIndexOf(`
`),
											M = K === -1 ? w : w.slice(K + 1);
										if (M.indexOf(z) !== -1) {
											var _ =
												`
` + M;
											break B;
										}
									}
									_ = I0(z + (H ? ' [' + H + ']' : ''));
								}
								X = R + _;
							}
						}
					((G = B), (B = B.return));
				} while (B);
				return X;
			} catch (V) {
				return (
					`
Error generating stack: ` +
					V.message +
					`
` +
					V.stack
				);
			}
		}
		function _5(B) {
			return (B = B ? B.displayName || B.name : '') ? I0(B) : '';
		}
		function x6() {
			if (U5 === null) return null;
			var B = U5._debugOwner;
			return B != null ? O5(B) : null;
		}
		function F4() {
			if (U5 === null) return '';
			var B = U5;
			try {
				var X = '';
				switch ((B.tag === 6 && (B = B.return), B.tag)) {
					case 26:
					case 27:
					case 5:
						X += I0(B.type);
						break;
					case 13:
						X += I0('Suspense');
						break;
					case 19:
						X += I0('SuspenseList');
						break;
					case 31:
						X += I0('Activity');
						break;
					case 30:
					case 0:
					case 15:
					case 1:
						B._debugOwner || X !== '' || (X += _5(B.type));
						break;
					case 11:
						B._debugOwner || X !== '' || (X += _5(B.type.render));
				}
				for (; B;)
					if (typeof B.tag === 'number') {
						var G = B;
						B = G._debugOwner;
						var Z = G._debugStack;
						if (B && Z) {
							var Y = P0(Z);
							Y !== '' &&
								(X +=
									`
` + Y);
						}
					} else if (B.debugStack != null) {
						var $ = B.debugStack;
						(B = B.owner) &&
							$ &&
							(X +=
								`
` + P0($));
					} else break;
				var R = X;
			} catch (z) {
				R =
					`
Error generating stack: ` +
					z.message +
					`
` +
					z.stack;
			}
			return R;
		}
		function k(B, X, G, Z, Y, $, R) {
			var z = U5;
			k1(B);
			try {
				return B !== null && B._debugTask
					? B._debugTask.run(X.bind(null, G, Z, Y, $, R))
					: X(G, Z, Y, $, R);
			} finally {
				k1(z);
			}
			throw Error(
				'runWithFiberInDEV should never be called in production. This is a bug in React.',
			);
		}
		function k1(B) {
			((A.getCurrentStack = B === null ? null : F4), (q6 = !1), (U5 = B));
		}
		function hB(B) {
			return (
				(typeof Symbol === 'function' && Symbol.toStringTag && B[Symbol.toStringTag]) ||
				B.constructor.name ||
				'Object'
			);
		}
		function t6(B) {
			try {
				return (W2(B), !1);
			} catch (X) {
				return !0;
			}
		}
		function W2(B) {
			return '' + B;
		}
		function V0(B, X) {
			if (t6(B))
				return (
					console.error(
						'The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.',
						X,
						hB(B),
					),
					W2(B)
				);
		}
		function dX(B, X) {
			if (t6(B))
				return (
					console.error(
						'The provided `%s` CSS property is an unsupported type %s. This value must be coerced to a string before using it here.',
						X,
						hB(B),
					),
					W2(B)
				);
		}
		function r(B) {
			if (t6(B))
				return (
					console.error(
						'Form field values (value, checked, defaultValue, or defaultChecked props) must be strings, not %s. This value must be coerced to a string before using it here.',
						hB(B),
					),
					W2(B)
				);
		}
		function b1(B) {
			if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > 'u') return !1;
			var X = __REACT_DEVTOOLS_GLOBAL_HOOK__;
			if (X.isDisabled) return !0;
			if (!X.supportsFiber)
				return (
					console.error(
						'The installed version of React DevTools is too old and will not work with the current version of React. Please update React DevTools. https://react.dev/link/react-devtools',
					),
					!0
				);
			try {
				((RX = X.inject(B)), (D2 = X));
			} catch (G) {
				console.error('React instrumentation encountered an error: %o.', G);
			}
			return X.checkDCE ? !0 : !1;
		}
		function g0(B) {
			if ((typeof Lq === 'function' && Aq(B), D2 && typeof D2.setStrictMode === 'function'))
				try {
					D2.setStrictMode(RX, B);
				} catch (X) {
					W6 || ((W6 = !0), console.error('React instrumentation encountered an error: %o', X));
				}
		}
		function P4(B) {
			return ((B >>>= 0), B === 0 ? 32 : (31 - ((jq(B) / Fq) | 0)) | 0);
		}
		function o5(B) {
			var X = B & 42;
			if (X !== 0) return X;
			switch (B & -B) {
				case 1:
					return 1;
				case 2:
					return 2;
				case 4:
					return 4;
				case 8:
					return 8;
				case 16:
					return 16;
				case 32:
					return 32;
				case 64:
					return 64;
				case 128:
					return 128;
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072:
					return B & 261888;
				case 262144:
				case 524288:
				case 1048576:
				case 2097152:
					return B & 3932160;
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432:
					return B & 62914560;
				case 67108864:
					return 67108864;
				case 134217728:
					return 134217728;
				case 268435456:
					return 268435456;
				case 536870912:
					return 536870912;
				case 1073741824:
					return 0;
				default:
					return (console.error('Should have found matching lanes. This is a bug in React.'), B);
			}
		}
		function dB(B, X, G) {
			var Z = B.pendingLanes;
			if (Z === 0) return 0;
			var Y = 0,
				$ = B.suspendedLanes,
				R = B.pingedLanes;
			B = B.warmLanes;
			var z = Z & 134217727;
			return (
				z !== 0
					? ((Z = z & ~$),
						Z !== 0
							? (Y = o5(Z))
							: ((R &= z), R !== 0 ? (Y = o5(R)) : G || ((G = z & ~B), G !== 0 && (Y = o5(G)))))
					: ((z = Z & ~$),
						z !== 0
							? (Y = o5(z))
							: R !== 0
								? (Y = o5(R))
								: G || ((G = Z & ~B), G !== 0 && (Y = o5(G)))),
				Y === 0
					? 0
					: X !== 0 &&
						  X !== Y &&
						  (X & $) === 0 &&
						  (($ = Y & -Y), (G = X & -X), $ >= G || ($ === 32 && (G & 4194048) !== 0))
						? X
						: Y
			);
		}
		function sB(B, X) {
			return (B.pendingLanes & ~(B.suspendedLanes & ~B.pingedLanes) & X) === 0;
		}
		function u9(B, X) {
			switch (B) {
				case 1:
				case 2:
				case 4:
				case 8:
				case 64:
					return X + 250;
				case 16:
				case 32:
				case 128:
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072:
				case 262144:
				case 524288:
				case 1048576:
				case 2097152:
					return X + 5000;
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432:
					return -1;
				case 67108864:
				case 134217728:
				case 268435456:
				case 536870912:
				case 1073741824:
					return -1;
				default:
					return (console.error('Should have found matching lanes. This is a bug in React.'), -1);
			}
		}
		function m1() {
			var B = y7;
			return ((y7 <<= 1), (y7 & 62914560) === 0 && (y7 = 4194304), B);
		}
		function y1(B) {
			for (var X = [], G = 0; 31 > G; G++) X.push(B);
			return X;
		}
		function r6(B, X) {
			((B.pendingLanes |= X),
				X !== 268435456 && ((B.suspendedLanes = 0), (B.pingedLanes = 0), (B.warmLanes = 0)));
		}
		function x4(B, X, G, Z, Y, $) {
			var R = B.pendingLanes;
			((B.pendingLanes = G),
				(B.suspendedLanes = 0),
				(B.pingedLanes = 0),
				(B.warmLanes = 0),
				(B.expiredLanes &= G),
				(B.entangledLanes &= G),
				(B.errorRecoveryDisabledLanes &= G),
				(B.shellSuspendCounter = 0));
			var { entanglements: z, expirationTimes: H, hiddenUpdates: J } = B;
			for (G = R & ~G; 0 < G;) {
				var w = 31 - g2(G),
					K = 1 << w;
				((z[w] = 0), (H[w] = -1));
				var M = J[w];
				if (M !== null)
					for (J[w] = null, w = 0; w < M.length; w++) {
						var _ = M[w];
						_ !== null && (_.lane &= -536870913);
					}
				G &= ~K;
			}
			(Z !== 0 && lB(B, Z, 0),
				$ !== 0 && Y === 0 && B.tag !== 0 && (B.suspendedLanes |= $ & ~(R & ~X)));
		}
		function lB(B, X, G) {
			((B.pendingLanes |= X), (B.suspendedLanes &= ~X));
			var Z = 31 - g2(X);
			((B.entangledLanes |= X),
				(B.entanglements[Z] = B.entanglements[Z] | 1073741824 | (G & 261930)));
		}
		function pB(B, X) {
			var G = (B.entangledLanes |= X);
			for (B = B.entanglements; G;) {
				var Z = 31 - g2(G),
					Y = 1 << Z;
				((Y & X) | (B[Z] & X) && (B[Z] |= X), (G &= ~Y));
			}
		}
		function cB(B, X) {
			var G = X & -X;
			return ((G = (G & 42) !== 0 ? 1 : aB(G)), (G & (B.suspendedLanes | X)) !== 0 ? 0 : G);
		}
		function aB(B) {
			switch (B) {
				case 2:
					B = 1;
					break;
				case 8:
					B = 4;
					break;
				case 32:
					B = 16;
					break;
				case 256:
				case 512:
				case 1024:
				case 2048:
				case 4096:
				case 8192:
				case 16384:
				case 32768:
				case 65536:
				case 131072:
				case 262144:
				case 524288:
				case 1048576:
				case 2097152:
				case 4194304:
				case 8388608:
				case 16777216:
				case 33554432:
					B = 128;
					break;
				case 268435456:
					B = 134217728;
					break;
				default:
					B = 0;
			}
			return B;
		}
		function sX(B, X, G) {
			if (w6)
				for (B = B.pendingUpdatersLaneMap; 0 < G;) {
					var Z = 31 - g2(G),
						Y = 1 << Z;
					(B[Z].add(X), (G &= ~Y));
				}
		}
		function e6(B, X) {
			if (w6)
				for (var { pendingUpdatersLaneMap: G, memoizedUpdaters: Z } = B; 0 < X;) {
					var Y = 31 - g2(X);
					((B = 1 << Y),
						(Y = G[Y]),
						0 < Y.size &&
							(Y.forEach(function ($) {
								var R = $.alternate;
								(R !== null && Z.has(R)) || Z.add($);
							}),
							Y.clear()),
						(X &= ~B));
				}
		}
		function U(B) {
			return (
				(B &= -B),
				Q5 !== 0 && Q5 < B ? (y5 !== 0 && y5 < B ? ((B & 134217727) !== 0 ? K6 : f7) : y5) : Q5
			);
		}
		function O() {
			var B = L0.p;
			if (B !== 0) return B;
			return ((B = window.event), B === void 0 ? K6 : MH(B.type));
		}
		function N(B, X) {
			var G = L0.p;
			try {
				return ((L0.p = B), X());
			} finally {
				L0.p = G;
			}
		}
		function C(B) {
			(delete B[N2], delete B[k2], delete B[RZ], delete B[Pq], delete B[xq]);
		}
		function b(B) {
			var X = B[N2];
			if (X) return X;
			for (var G = B.parentNode; G;) {
				if ((X = G[KB] || G[N2])) {
					if (((G = X.alternate), X.child !== null || (G !== null && G.child !== null)))
						for (B = rz(B); B !== null;) {
							if ((G = B[N2])) return G;
							B = rz(B);
						}
					return X;
				}
				((B = G), (G = B.parentNode));
			}
			return null;
		}
		function n(B) {
			if ((B = B[N2] || B[KB])) {
				var X = B.tag;
				if (X === 5 || X === 6 || X === 13 || X === 31 || X === 26 || X === 27 || X === 3) return B;
			}
			return null;
		}
		function i(B) {
			var X = B.tag;
			if (X === 5 || X === 26 || X === 27 || X === 6) return B.stateNode;
			throw Error('getNodeFromInstance: Invalid argument.');
		}
		function W0(B) {
			var X = B[VH];
			return (X || (X = B[VH] = { hoistableStyles: new Map(), hoistableScripts: new Map() }), X);
		}
		function f(B) {
			B[C3] = !0;
		}
		function V2(B, X) {
			(B5(B, X), B5(B + 'Capture', X));
		}
		function B5(B, X) {
			(J1[B] &&
				console.error(
					'EventRegistry: More than one plugin attempted to publish the same registration name, `%s`.',
					B,
				),
				(J1[B] = X));
			var G = B.toLowerCase();
			((zZ[G] = B), B === 'onDoubleClick' && (zZ.ondblclick = B));
			for (B = 0; B < X.length; B++) CH.add(X[B]);
		}
		function BB(B, X) {
			(Nq[X.type] ||
				X.onChange ||
				X.onInput ||
				X.readOnly ||
				X.disabled ||
				X.value == null ||
				(B === 'select'
					? console.error(
							'You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set `onChange`.',
						)
					: console.error(
							'You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`.',
						)),
				X.onChange ||
					X.readOnly ||
					X.disabled ||
					X.checked == null ||
					console.error(
						'You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`.',
					));
		}
		function lX(B) {
			if (m5.call(TH, B)) return !0;
			if (m5.call(DH, B)) return !1;
			if (Eq.test(B)) return (TH[B] = !0);
			return ((DH[B] = !0), console.error('Invalid attribute name: `%s`', B), !1);
		}
		function FY(B, X, G) {
			if (lX(X)) {
				if (!B.hasAttribute(X)) {
					switch (typeof G) {
						case 'symbol':
						case 'object':
							return G;
						case 'function':
							return G;
						case 'boolean':
							if (G === !1) return G;
					}
					return G === void 0 ? void 0 : null;
				}
				if (((B = B.getAttribute(X)), B === '' && G === !0)) return !0;
				return (V0(G, X), B === '' + G ? G : B);
			}
		}
		function N4(B, X, G) {
			if (lX(X))
				if (G === null) B.removeAttribute(X);
				else {
					switch (typeof G) {
						case 'undefined':
						case 'function':
						case 'symbol':
							B.removeAttribute(X);
							return;
						case 'boolean':
							var Z = X.toLowerCase().slice(0, 5);
							if (Z !== 'data-' && Z !== 'aria-') {
								B.removeAttribute(X);
								return;
							}
					}
					(V0(G, X), B.setAttribute(X, '' + G));
				}
		}
		function E4(B, X, G) {
			if (G === null) B.removeAttribute(X);
			else {
				switch (typeof G) {
					case 'undefined':
					case 'function':
					case 'symbol':
					case 'boolean':
						B.removeAttribute(X);
						return;
				}
				(V0(G, X), B.setAttribute(X, '' + G));
			}
		}
		function N6(B, X, G, Z) {
			if (Z === null) B.removeAttribute(G);
			else {
				switch (typeof Z) {
					case 'undefined':
					case 'function':
					case 'symbol':
					case 'boolean':
						B.removeAttribute(G);
						return;
				}
				(V0(Z, G), B.setAttributeNS(X, G, '' + Z));
			}
		}
		function L5(B) {
			switch (typeof B) {
				case 'bigint':
				case 'boolean':
				case 'number':
				case 'string':
				case 'undefined':
					return B;
				case 'object':
					return (r(B), B);
				default:
					return '';
			}
		}
		function PY(B) {
			var X = B.type;
			return (B = B.nodeName) && B.toLowerCase() === 'input' && (X === 'checkbox' || X === 'radio');
		}
		function FQ(B, X, G) {
			var Z = Object.getOwnPropertyDescriptor(B.constructor.prototype, X);
			if (
				!B.hasOwnProperty(X) &&
				typeof Z < 'u' &&
				typeof Z.get === 'function' &&
				typeof Z.set === 'function'
			) {
				var { get: Y, set: $ } = Z;
				return (
					Object.defineProperty(B, X, {
						configurable: !0,
						get: function () {
							return Y.call(this);
						},
						set: function (R) {
							(r(R), (G = '' + R), $.call(this, R));
						},
					}),
					Object.defineProperty(B, X, { enumerable: Z.enumerable }),
					{
						getValue: function () {
							return G;
						},
						setValue: function (R) {
							(r(R), (G = '' + R));
						},
						stopTracking: function () {
							((B._valueTracker = null), delete B[X]);
						},
					}
				);
			}
		}
		function h9(B) {
			if (!B._valueTracker) {
				var X = PY(B) ? 'checked' : 'value';
				B._valueTracker = FQ(B, X, '' + B[X]);
			}
		}
		function xY(B) {
			if (!B) return !1;
			var X = B._valueTracker;
			if (!X) return !0;
			var G = X.getValue(),
				Z = '';
			return (
				B && (Z = PY(B) ? (B.checked ? 'true' : 'false') : B.value),
				(B = Z),
				B !== G ? (X.setValue(B), !0) : !1
			);
		}
		function I4(B) {
			if (((B = B || (typeof document < 'u' ? document : void 0)), typeof B > 'u')) return null;
			try {
				return B.activeElement || B.body;
			} catch (X) {
				return B.body;
			}
		}
		function A5(B) {
			return B.replace(Iq, function (X) {
				return '\\' + X.charCodeAt(0).toString(16) + ' ';
			});
		}
		function NY(B, X) {
			(X.checked === void 0 ||
				X.defaultChecked === void 0 ||
				SH ||
				(console.error(
					'%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components',
					x6() || 'A component',
					X.type,
				),
				(SH = !0)),
				X.value === void 0 ||
					X.defaultValue === void 0 ||
					vH ||
					(console.error(
						'%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components',
						x6() || 'A component',
						X.type,
					),
					(vH = !0)));
		}
		function d9(B, X, G, Z, Y, $, R, z) {
			if (
				((B.name = ''),
				R != null && typeof R !== 'function' && typeof R !== 'symbol' && typeof R !== 'boolean'
					? (V0(R, 'type'), (B.type = R))
					: B.removeAttribute('type'),
				X != null)
			)
				if (R === 'number') {
					if ((X === 0 && B.value === '') || B.value != X) B.value = '' + L5(X);
				} else B.value !== '' + L5(X) && (B.value = '' + L5(X));
			else (R !== 'submit' && R !== 'reset') || B.removeAttribute('value');
			(X != null
				? s9(B, R, L5(X))
				: G != null
					? s9(B, R, L5(G))
					: Z != null && B.removeAttribute('value'),
				Y == null && $ != null && (B.defaultChecked = !!$),
				Y != null && (B.checked = Y && typeof Y !== 'function' && typeof Y !== 'symbol'),
				z != null && typeof z !== 'function' && typeof z !== 'symbol' && typeof z !== 'boolean'
					? (V0(z, 'name'), (B.name = '' + L5(z)))
					: B.removeAttribute('name'));
		}
		function EY(B, X, G, Z, Y, $, R, z) {
			if (
				($ != null &&
					typeof $ !== 'function' &&
					typeof $ !== 'symbol' &&
					typeof $ !== 'boolean' &&
					(V0($, 'type'), (B.type = $)),
				X != null || G != null)
			) {
				if (!(($ !== 'submit' && $ !== 'reset') || (X !== void 0 && X !== null))) {
					h9(B);
					return;
				}
				((G = G != null ? '' + L5(G) : ''),
					(X = X != null ? '' + L5(X) : G),
					z || X === B.value || (B.value = X),
					(B.defaultValue = X));
			}
			((Z = Z != null ? Z : Y),
				(Z = typeof Z !== 'function' && typeof Z !== 'symbol' && !!Z),
				(B.checked = z ? B.checked : !!Z),
				(B.defaultChecked = !!Z),
				R != null &&
					typeof R !== 'function' &&
					typeof R !== 'symbol' &&
					typeof R !== 'boolean' &&
					(V0(R, 'name'), (B.name = R)),
				h9(B));
		}
		function s9(B, X, G) {
			(X === 'number' && I4(B.ownerDocument) === B) ||
				B.defaultValue === '' + G ||
				(B.defaultValue = '' + G);
		}
		function IY(B, X) {
			(X.value == null &&
				(typeof X.children === 'object' && X.children !== null
					? hX.Children.forEach(X.children, function (G) {
							G == null ||
								typeof G === 'string' ||
								typeof G === 'number' ||
								typeof G === 'bigint' ||
								kH ||
								((kH = !0),
								console.error(
									'Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>.',
								));
						})
					: X.dangerouslySetInnerHTML == null ||
						bH ||
						((bH = !0),
						console.error(
							'Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected.',
						))),
				X.selected == null ||
					gH ||
					(console.error(
						'Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>.',
					),
					(gH = !0)));
		}
		function VY() {
			var B = x6();
			return B
				? `

Check the render method of \`` +
						B +
						'`.'
				: '';
		}
		function f1(B, X, G, Z) {
			if (((B = B.options), X)) {
				X = {};
				for (var Y = 0; Y < G.length; Y++) X['$' + G[Y]] = !0;
				for (G = 0; G < B.length; G++)
					((Y = X.hasOwnProperty('$' + B[G].value)),
						B[G].selected !== Y && (B[G].selected = Y),
						Y && Z && (B[G].defaultSelected = !0));
			} else {
				((G = '' + L5(G)), (X = null));
				for (Y = 0; Y < B.length; Y++) {
					if (B[Y].value === G) {
						((B[Y].selected = !0), Z && (B[Y].defaultSelected = !0));
						return;
					}
					X !== null || B[Y].disabled || (X = B[Y]);
				}
				X !== null && (X.selected = !0);
			}
		}
		function CY(B, X) {
			for (B = 0; B < yH.length; B++) {
				var G = yH[B];
				if (X[G] != null) {
					var Z = Q2(X[G]);
					X.multiple && !Z
						? console.error(
								'The `%s` prop supplied to <select> must be an array if `multiple` is true.%s',
								G,
								VY(),
							)
						: !X.multiple &&
							Z &&
							console.error(
								'The `%s` prop supplied to <select> must be a scalar value if `multiple` is false.%s',
								G,
								VY(),
							);
				}
			}
			X.value === void 0 ||
				X.defaultValue === void 0 ||
				mH ||
				(console.error(
					'Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components',
				),
				(mH = !0));
		}
		function DY(B, X) {
			(X.value === void 0 ||
				X.defaultValue === void 0 ||
				fH ||
				(console.error(
					'%s contains a textarea with both value and defaultValue props. Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components',
					x6() || 'A component',
				),
				(fH = !0)),
				X.children != null &&
					X.value == null &&
					console.error(
						'Use the `defaultValue` or `value` props instead of setting children on <textarea>.',
					));
		}
		function TY(B, X, G) {
			if (X != null && ((X = '' + L5(X)), X !== B.value && (B.value = X), G == null)) {
				B.defaultValue !== X && (B.defaultValue = X);
				return;
			}
			B.defaultValue = G != null ? '' + L5(G) : '';
		}
		function vY(B, X, G, Z) {
			if (X == null) {
				if (Z != null) {
					if (G != null)
						throw Error('If you supply `defaultValue` on a <textarea>, do not pass children.');
					if (Q2(Z)) {
						if (1 < Z.length) throw Error('<textarea> can only have at most one child.');
						Z = Z[0];
					}
					G = Z;
				}
				(G == null && (G = ''), (X = G));
			}
			((G = L5(X)),
				(B.defaultValue = G),
				(Z = B.textContent),
				Z === G && Z !== '' && Z !== null && (B.value = Z),
				h9(B));
		}
		function SY(B, X) {
			return B.serverProps === void 0 &&
				B.serverTail.length === 0 &&
				B.children.length === 1 &&
				3 < B.distanceFromLeaf &&
				B.distanceFromLeaf > 15 - X
				? SY(B.children[0], X)
				: B;
		}
		function X5(B) {
			return '  ' + '  '.repeat(B);
		}
		function u1(B) {
			return '+ ' + '  '.repeat(B);
		}
		function oB(B) {
			return '- ' + '  '.repeat(B);
		}
		function gY(B) {
			switch (B.tag) {
				case 26:
				case 27:
				case 5:
					return B.type;
				case 16:
					return 'Lazy';
				case 31:
					return 'Activity';
				case 13:
					return 'Suspense';
				case 19:
					return 'SuspenseList';
				case 0:
				case 15:
					return ((B = B.type), B.displayName || B.name || null);
				case 11:
					return ((B = B.type.render), B.displayName || B.name || null);
				case 1:
					return ((B = B.type), B.displayName || B.name || null);
				default:
					return null;
			}
		}
		function pX(B, X) {
			return uH.test(B)
				? ((B = JSON.stringify(B)),
					B.length > X - 2
						? 8 > X
							? '{"..."}'
							: '{' + B.slice(0, X - 7) + '..."}'
						: '{' + B + '}')
				: B.length > X
					? 5 > X
						? '{"..."}'
						: B.slice(0, X - 3) + '...'
					: B;
		}
		function V4(B, X, G) {
			var Z = 120 - 2 * G;
			if (X === null)
				return (
					u1(G) +
					pX(B, Z) +
					`
`
				);
			if (typeof X === 'string') {
				for (var Y = 0; Y < X.length && Y < B.length && X.charCodeAt(Y) === B.charCodeAt(Y); Y++);
				return (
					Y > Z - 8 && 10 < Y && ((B = '...' + B.slice(Y - 8)), (X = '...' + X.slice(Y - 8))),
					u1(G) +
						pX(B, Z) +
						`
` +
						oB(G) +
						pX(X, Z) +
						`
`
				);
			}
			return (
				X5(G) +
				pX(B, Z) +
				`
`
			);
		}
		function l9(B) {
			return Object.prototype.toString.call(B).replace(/^\[object (.*)\]$/, function (X, G) {
				return G;
			});
		}
		function cX(B, X) {
			switch (typeof B) {
				case 'string':
					return (
						(B = JSON.stringify(B)),
						B.length > X ? (5 > X ? '"..."' : B.slice(0, X - 4) + '..."') : B
					);
				case 'object':
					if (B === null) return 'null';
					if (Q2(B)) return '[...]';
					if (B.$$typeof === Q6) return (X = J0(B.type)) ? '<' + X + '>' : '<...>';
					var G = l9(B);
					if (G === 'Object') {
						((G = ''), (X -= 2));
						for (var Z in B)
							if (B.hasOwnProperty(Z)) {
								var Y = JSON.stringify(Z);
								if (
									(Y !== '"' + Z + '"' && (Z = Y),
									(X -= Z.length - 2),
									(Y = cX(B[Z], 15 > X ? X : 15)),
									(X -= Y.length),
									0 > X)
								) {
									G += G === '' ? '...' : ', ...';
									break;
								}
								G += (G === '' ? '' : ',') + Z + ':' + Y;
							}
						return '{' + G + '}';
					}
					return G;
				case 'function':
					return (X = B.displayName || B.name) ? 'function ' + X : 'function';
				default:
					return String(B);
			}
		}
		function h1(B, X) {
			return typeof B !== 'string' || uH.test(B)
				? '{' + cX(B, X - 2) + '}'
				: B.length > X - 2
					? 5 > X
						? '"..."'
						: '"' + B.slice(0, X - 5) + '..."'
					: '"' + B + '"';
		}
		function p9(B, X, G) {
			var Z = 120 - G.length - B.length,
				Y = [],
				$;
			for ($ in X)
				if (X.hasOwnProperty($) && $ !== 'children') {
					var R = h1(X[$], 120 - G.length - $.length - 1);
					((Z -= $.length + R.length + 2), Y.push($ + '=' + R));
				}
			return Y.length === 0
				? G +
						'<' +
						B +
						`>
`
				: 0 < Z
					? G +
						'<' +
						B +
						' ' +
						Y.join(' ') +
						`>
`
					: G +
						'<' +
						B +
						`
` +
						G +
						'  ' +
						Y.join(
							`
` +
								G +
								'  ',
						) +
						`
` +
						G +
						`>
`;
		}
		function PQ(B, X, G) {
			var Z = '',
				Y = Y0({}, X),
				$;
			for ($ in B)
				if (B.hasOwnProperty($)) {
					delete Y[$];
					var R = 120 - 2 * G - $.length - 2,
						z = cX(B[$], R);
					X.hasOwnProperty($)
						? ((R = cX(X[$], R)),
							(Z +=
								u1(G) +
								$ +
								': ' +
								z +
								`
`),
							(Z +=
								oB(G) +
								$ +
								': ' +
								R +
								`
`))
						: (Z +=
								u1(G) +
								$ +
								': ' +
								z +
								`
`);
				}
			for (var H in Y)
				Y.hasOwnProperty(H) &&
					((B = cX(Y[H], 120 - 2 * G - H.length - 2)),
					(Z +=
						oB(G) +
						H +
						': ' +
						B +
						`
`));
			return Z;
		}
		function xQ(B, X, G, Z) {
			var Y = '',
				$ = new Map();
			for (J in G) G.hasOwnProperty(J) && $.set(J.toLowerCase(), J);
			if ($.size === 1 && $.has('children')) Y += p9(B, X, X5(Z));
			else {
				for (var R in X)
					if (X.hasOwnProperty(R) && R !== 'children') {
						var z = 120 - 2 * (Z + 1) - R.length - 1,
							H = $.get(R.toLowerCase());
						if (H !== void 0) {
							$.delete(R.toLowerCase());
							var J = X[R];
							H = G[H];
							var w = h1(J, z);
							((z = h1(H, z)),
								typeof J === 'object' &&
								J !== null &&
								typeof H === 'object' &&
								H !== null &&
								l9(J) === 'Object' &&
								l9(H) === 'Object' &&
								(2 < Object.keys(J).length ||
									2 < Object.keys(H).length ||
									-1 < w.indexOf('...') ||
									-1 < z.indexOf('...'))
									? (Y +=
											X5(Z + 1) +
											R +
											`={{
` +
											PQ(J, H, Z + 2) +
											X5(Z + 1) +
											`}}
`)
									: ((Y +=
											u1(Z + 1) +
											R +
											'=' +
											w +
											`
`),
										(Y +=
											oB(Z + 1) +
											R +
											'=' +
											z +
											`
`)));
						} else
							Y +=
								X5(Z + 1) +
								R +
								'=' +
								h1(X[R], z) +
								`
`;
					}
				($.forEach(function (K) {
					if (K !== 'children') {
						var M = 120 - 2 * (Z + 1) - K.length - 1;
						Y +=
							oB(Z + 1) +
							K +
							'=' +
							h1(G[K], M) +
							`
`;
					}
				}),
					(Y =
						Y === ''
							? X5(Z) +
								'<' +
								B +
								`>
`
							: X5(Z) +
								'<' +
								B +
								`
` +
								Y +
								X5(Z) +
								`>
`));
			}
			if (
				((B = G.children),
				(X = X.children),
				typeof B === 'string' || typeof B === 'number' || typeof B === 'bigint')
			) {
				if ((($ = ''), typeof X === 'string' || typeof X === 'number' || typeof X === 'bigint'))
					$ = '' + X;
				Y += V4($, '' + B, Z + 1);
			} else if (typeof X === 'string' || typeof X === 'number' || typeof X === 'bigint')
				Y = B == null ? Y + V4('' + X, null, Z + 1) : Y + V4('' + X, void 0, Z + 1);
			return Y;
		}
		function kY(B, X) {
			var G = gY(B);
			if (G === null) {
				G = '';
				for (B = B.child; B;) ((G += kY(B, X)), (B = B.sibling));
				return G;
			}
			return (
				X5(X) +
				'<' +
				G +
				`>
`
			);
		}
		function c9(B, X) {
			var G = SY(B, X);
			if (G !== B && (B.children.length !== 1 || B.children[0] !== G))
				return (
					X5(X) +
					`...
` +
					c9(G, X + 1)
				);
			G = '';
			var Z = B.fiber._debugInfo;
			if (Z)
				for (var Y = 0; Y < Z.length; Y++) {
					var $ = Z[Y].name;
					typeof $ === 'string' &&
						((G +=
							X5(X) +
							'<' +
							$ +
							`>
`),
						X++);
				}
			if (((Z = ''), (Y = B.fiber.pendingProps), B.fiber.tag === 6))
				((Z = V4(Y, B.serverProps, X)), X++);
			else if ((($ = gY(B.fiber)), $ !== null))
				if (B.serverProps === void 0) {
					Z = X;
					var R = 120 - 2 * Z - $.length - 2,
						z = '';
					for (J in Y)
						if (Y.hasOwnProperty(J) && J !== 'children') {
							var H = h1(Y[J], 15);
							if (((R -= J.length + H.length + 2), 0 > R)) {
								z += ' ...';
								break;
							}
							z += ' ' + J + '=' + H;
						}
					((Z =
						X5(Z) +
						'<' +
						$ +
						z +
						`>
`),
						X++);
				} else
					B.serverProps === null
						? ((Z = p9($, Y, u1(X))), X++)
						: typeof B.serverProps === 'string'
							? console.error(
									'Should not have matched a non HostText fiber to a Text node. This is a bug in React.',
								)
							: ((Z = xQ($, Y, B.serverProps, X)), X++);
			var J = '';
			Y = B.fiber.child;
			for ($ = 0; Y && $ < B.children.length;)
				((R = B.children[$]),
					R.fiber === Y ? ((J += c9(R, X)), $++) : (J += kY(Y, X)),
					(Y = Y.sibling));
			(Y &&
				0 < B.children.length &&
				(J +=
					X5(X) +
					`...
`),
				(Y = B.serverTail),
				B.serverProps === null && X--);
			for (B = 0; B < Y.length; B++)
				(($ = Y[B]),
					(J =
						typeof $ === 'string'
							? J +
								(oB(X) +
									pX($, 120 - 2 * X) +
									`
`)
							: J + p9($.type, $.props, oB(X))));
			return G + Z + J;
		}
		function a9(B) {
			try {
				return (
					`

` + c9(B, 0)
				);
			} catch (X) {
				return '';
			}
		}
		function bY(B, X, G) {
			for (var Z = X, Y = null, $ = 0; Z;)
				(Z === B && ($ = 0),
					(Y = {
						fiber: Z,
						children: Y !== null ? [Y] : [],
						serverProps: Z === X ? G : Z === B ? null : void 0,
						serverTail: [],
						distanceFromLeaf: $,
					}),
					$++,
					(Z = Z.return));
			return Y !== null ? a9(Y).replaceAll(/^[+-]/gm, '>') : '';
		}
		function mY(B, X) {
			var G = Y0({}, B || dH),
				Z = { tag: X };
			if (
				(hH.indexOf(X) !== -1 &&
					((G.aTagInScope = null), (G.buttonTagInScope = null), (G.nobrTagInScope = null)),
				Cq.indexOf(X) !== -1 && (G.pTagInButtonScope = null),
				Vq.indexOf(X) !== -1 &&
					X !== 'address' &&
					X !== 'div' &&
					X !== 'p' &&
					((G.listItemTagAutoclosing = null), (G.dlItemTagAutoclosing = null)),
				(G.current = Z),
				X === 'form' && (G.formTag = Z),
				X === 'a' && (G.aTagInScope = Z),
				X === 'button' && (G.buttonTagInScope = Z),
				X === 'nobr' && (G.nobrTagInScope = Z),
				X === 'p' && (G.pTagInButtonScope = Z),
				X === 'li' && (G.listItemTagAutoclosing = Z),
				X === 'dd' || X === 'dt')
			)
				G.dlItemTagAutoclosing = Z;
			return (
				X === '#document' || X === 'html'
					? (G.containerTagInScope = null)
					: G.containerTagInScope || (G.containerTagInScope = Z),
				B !== null || (X !== '#document' && X !== 'html' && X !== 'body')
					? G.implicitRootScope === !0 && (G.implicitRootScope = !1)
					: (G.implicitRootScope = !0),
				G
			);
		}
		function yY(B, X, G) {
			switch (X) {
				case 'select':
					return (
						B === 'hr' ||
						B === 'option' ||
						B === 'optgroup' ||
						B === 'script' ||
						B === 'template' ||
						B === '#text'
					);
				case 'optgroup':
					return B === 'option' || B === '#text';
				case 'option':
					return B === '#text';
				case 'tr':
					return B === 'th' || B === 'td' || B === 'style' || B === 'script' || B === 'template';
				case 'tbody':
				case 'thead':
				case 'tfoot':
					return B === 'tr' || B === 'style' || B === 'script' || B === 'template';
				case 'colgroup':
					return B === 'col' || B === 'template';
				case 'table':
					return (
						B === 'caption' ||
						B === 'colgroup' ||
						B === 'tbody' ||
						B === 'tfoot' ||
						B === 'thead' ||
						B === 'style' ||
						B === 'script' ||
						B === 'template'
					);
				case 'head':
					return (
						B === 'base' ||
						B === 'basefont' ||
						B === 'bgsound' ||
						B === 'link' ||
						B === 'meta' ||
						B === 'title' ||
						B === 'noscript' ||
						B === 'noframes' ||
						B === 'style' ||
						B === 'script' ||
						B === 'template'
					);
				case 'html':
					if (G) break;
					return B === 'head' || B === 'body' || B === 'frameset';
				case 'frameset':
					return B === 'frame';
				case '#document':
					if (!G) return B === 'html';
			}
			switch (B) {
				case 'h1':
				case 'h2':
				case 'h3':
				case 'h4':
				case 'h5':
				case 'h6':
					return X !== 'h1' && X !== 'h2' && X !== 'h3' && X !== 'h4' && X !== 'h5' && X !== 'h6';
				case 'rp':
				case 'rt':
					return Dq.indexOf(X) === -1;
				case 'caption':
				case 'col':
				case 'colgroup':
				case 'frameset':
				case 'frame':
				case 'tbody':
				case 'td':
				case 'tfoot':
				case 'th':
				case 'thead':
				case 'tr':
					return X == null;
				case 'head':
					return G || X === null;
				case 'html':
					return (G && X === '#document') || X === null;
				case 'body':
					return (G && (X === '#document' || X === 'html')) || X === null;
			}
			return !0;
		}
		function NQ(B, X) {
			switch (B) {
				case 'address':
				case 'article':
				case 'aside':
				case 'blockquote':
				case 'center':
				case 'details':
				case 'dialog':
				case 'dir':
				case 'div':
				case 'dl':
				case 'fieldset':
				case 'figcaption':
				case 'figure':
				case 'footer':
				case 'header':
				case 'hgroup':
				case 'main':
				case 'menu':
				case 'nav':
				case 'ol':
				case 'p':
				case 'section':
				case 'summary':
				case 'ul':
				case 'pre':
				case 'listing':
				case 'table':
				case 'hr':
				case 'xmp':
				case 'h1':
				case 'h2':
				case 'h3':
				case 'h4':
				case 'h5':
				case 'h6':
					return X.pTagInButtonScope;
				case 'form':
					return X.formTag || X.pTagInButtonScope;
				case 'li':
					return X.listItemTagAutoclosing;
				case 'dd':
				case 'dt':
					return X.dlItemTagAutoclosing;
				case 'button':
					return X.buttonTagInScope;
				case 'a':
					return X.aTagInScope;
				case 'nobr':
					return X.nobrTagInScope;
			}
			return null;
		}
		function fY(B, X) {
			for (; B;) {
				switch (B.tag) {
					case 5:
					case 26:
					case 27:
						if (B.type === X) return B;
				}
				B = B.return;
			}
			return null;
		}
		function o9(B, X) {
			X = X || dH;
			var G = X.current;
			if (
				((X = (G = yY(B, G && G.tag, X.implicitRootScope) ? null : G) ? null : NQ(B, X)),
				(X = G || X),
				!X)
			)
				return !0;
			var Z = X.tag;
			if (((X = String(!!G) + '|' + B + '|' + Z), u7[X])) return !1;
			u7[X] = !0;
			var Y = (X = U5) ? fY(X.return, Z) : null,
				$ = X !== null && Y !== null ? bY(Y, X, null) : '',
				R = '<' + B + '>';
			return (
				G
					? ((G = ''),
						Z === 'table' &&
							B === 'tr' &&
							(G +=
								' Add a <tbody>, <thead> or <tfoot> to your code to match the DOM tree generated by the browser.'),
						console.error(
							`In HTML, %s cannot be a child of <%s>.%s
This will cause a hydration error.%s`,
							R,
							Z,
							G,
							$,
						))
					: console.error(
							`In HTML, %s cannot be a descendant of <%s>.
This will cause a hydration error.%s`,
							R,
							Z,
							$,
						),
				X &&
					((B = X.return),
					Y === null ||
						B === null ||
						(Y === B && B._debugOwner === X._debugOwner) ||
						k(Y, function () {
							console.error(
								`<%s> cannot contain a nested %s.
See this log for the ancestor stack trace.`,
								Z,
								R,
							);
						})),
				!1
			);
		}
		function C4(B, X, G) {
			if (G || yY('#text', X, !1)) return !0;
			if (((G = '#text|' + X), u7[G])) return !1;
			u7[G] = !0;
			var Z = (G = U5) ? fY(G, X) : null;
			return (
				(G = G !== null && Z !== null ? bY(Z, G, G.tag !== 6 ? { children: null } : null) : ''),
				/\S/.test(B)
					? console.error(
							`In HTML, text nodes cannot be a child of <%s>.
This will cause a hydration error.%s`,
							X,
							G,
						)
					: console.error(
							`In HTML, whitespace text nodes cannot be a child of <%s>. Make sure you don't have any extra whitespace between tags on each line of your source code.
This will cause a hydration error.%s`,
							X,
							G,
						),
				!1
			);
		}
		function aX(B, X) {
			if (X) {
				var G = B.firstChild;
				if (G && G === B.lastChild && G.nodeType === 3) {
					G.nodeValue = X;
					return;
				}
			}
			B.textContent = X;
		}
		function EQ(B) {
			return B.replace(Sq, function (X, G) {
				return G.toUpperCase();
			});
		}
		function uY(B, X, G) {
			var Z = X.indexOf('--') === 0;
			(Z ||
				(-1 < X.indexOf('-')
					? (zX.hasOwnProperty(X) && zX[X]) ||
						((zX[X] = !0),
						console.error(
							'Unsupported style property %s. Did you mean %s?',
							X,
							EQ(X.replace(vq, 'ms-')),
						))
					: Tq.test(X)
						? (zX.hasOwnProperty(X) && zX[X]) ||
							((zX[X] = !0),
							console.error(
								'Unsupported vendor-prefixed style property %s. Did you mean %s?',
								X,
								X.charAt(0).toUpperCase() + X.slice(1),
							))
						: !pH.test(G) ||
							(JZ.hasOwnProperty(G) && JZ[G]) ||
							((JZ[G] = !0),
							console.error(
								`Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
								X,
								G.replace(pH, ''),
							)),
				typeof G === 'number' &&
					(isNaN(G)
						? cH ||
							((cH = !0),
							console.error('`NaN` is an invalid value for the `%s` css style property.', X))
						: isFinite(G) ||
							aH ||
							((aH = !0),
							console.error(
								'`Infinity` is an invalid value for the `%s` css style property.',
								X,
							)))),
				G == null || typeof G === 'boolean' || G === ''
					? Z
						? B.setProperty(X, '')
						: X === 'float'
							? (B.cssFloat = '')
							: (B[X] = '')
					: Z
						? B.setProperty(X, G)
						: typeof G !== 'number' || G === 0 || oH.has(X)
							? X === 'float'
								? (B.cssFloat = G)
								: (dX(G, X), (B[X] = ('' + G).trim()))
							: (B[X] = G + 'px'));
		}
		function hY(B, X, G) {
			if (X != null && typeof X !== 'object')
				throw Error(
					"The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX.",
				);
			if ((X && Object.freeze(X), (B = B.style), G != null)) {
				if (X) {
					var Z = {};
					if (G) {
						for (var Y in G)
							if (G.hasOwnProperty(Y) && !X.hasOwnProperty(Y))
								for (var $ = HZ[Y] || [Y], R = 0; R < $.length; R++) Z[$[R]] = Y;
					}
					for (var z in X)
						if (X.hasOwnProperty(z) && (!G || G[z] !== X[z]))
							for (Y = HZ[z] || [z], $ = 0; $ < Y.length; $++) Z[Y[$]] = z;
					z = {};
					for (var H in X) for (Y = HZ[H] || [H], $ = 0; $ < Y.length; $++) z[Y[$]] = H;
					H = {};
					for (var J in Z)
						if (((Y = Z[J]), ($ = z[J]) && Y !== $ && ((R = Y + ',' + $), !H[R]))) {
							((H[R] = !0), (R = console));
							var w = X[Y];
							R.error.call(
								R,
								"%s a style property during rerender (%s) when a conflicting property is set (%s) can lead to styling bugs. To avoid this, don't mix shorthand and non-shorthand properties for the same value; instead, replace the shorthand with separate values.",
								w == null || typeof w === 'boolean' || w === '' ? 'Removing' : 'Updating',
								Y,
								$,
							);
						}
				}
				for (var K in G)
					!G.hasOwnProperty(K) ||
						(X != null && X.hasOwnProperty(K)) ||
						(K.indexOf('--') === 0
							? B.setProperty(K, '')
							: K === 'float'
								? (B.cssFloat = '')
								: (B[K] = ''));
				for (var M in X) ((J = X[M]), X.hasOwnProperty(M) && G[M] !== J && uY(B, M, J));
			} else for (Z in X) X.hasOwnProperty(Z) && uY(B, Z, X[Z]);
		}
		function oX(B) {
			if (B.indexOf('-') === -1) return !1;
			switch (B) {
				case 'annotation-xml':
				case 'color-profile':
				case 'font-face':
				case 'font-face-src':
				case 'font-face-uri':
				case 'font-face-format':
				case 'font-face-name':
				case 'missing-glyph':
					return !1;
				default:
					return !0;
			}
		}
		function dY(B) {
			return gq.get(B) || B;
		}
		function IQ(B, X) {
			if (m5.call(JX, X) && JX[X]) return !0;
			if (bq.test(X)) {
				if (
					((B = 'aria-' + X.slice(4).toLowerCase()),
					(B = nH.hasOwnProperty(B) ? B : null),
					B == null)
				)
					return (
						console.error(
							'Invalid ARIA attribute `%s`. ARIA attributes follow the pattern aria-* and must be lowercase.',
							X,
						),
						(JX[X] = !0)
					);
				if (X !== B)
					return (
						console.error('Invalid ARIA attribute `%s`. Did you mean `%s`?', X, B),
						(JX[X] = !0)
					);
			}
			if (kq.test(X)) {
				if (((B = X.toLowerCase()), (B = nH.hasOwnProperty(B) ? B : null), B == null))
					return ((JX[X] = !0), !1);
				X !== B &&
					(console.error('Unknown ARIA attribute `%s`. Did you mean `%s`?', X, B), (JX[X] = !0));
			}
			return !0;
		}
		function VQ(B, X) {
			var G = [],
				Z;
			for (Z in X) IQ(B, Z) || G.push(Z);
			((X = G.map(function (Y) {
				return '`' + Y + '`';
			}).join(', ')),
				G.length === 1
					? console.error(
							'Invalid aria prop %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props',
							X,
							B,
						)
					: 1 < G.length &&
						console.error(
							'Invalid aria props %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props',
							X,
							B,
						));
		}
		function CQ(B, X, G, Z) {
			if (m5.call(b2, X) && b2[X]) return !0;
			var Y = X.toLowerCase();
			if (Y === 'onfocusin' || Y === 'onfocusout')
				return (
					console.error(
						'React uses onFocus and onBlur instead of onFocusIn and onFocusOut. All React events are normalized to bubble, so onFocusIn and onFocusOut are not needed/supported by React.',
					),
					(b2[X] = !0)
				);
			if (
				typeof G === 'function' &&
				((B === 'form' && X === 'action') ||
					(B === 'input' && X === 'formAction') ||
					(B === 'button' && X === 'formAction'))
			)
				return !0;
			if (Z != null) {
				if (((B = Z.possibleRegistrationNames), Z.registrationNameDependencies.hasOwnProperty(X)))
					return !0;
				if (((Z = B.hasOwnProperty(Y) ? B[Y] : null), Z != null))
					return (
						console.error('Invalid event handler property `%s`. Did you mean `%s`?', X, Z),
						(b2[X] = !0)
					);
				if (tH.test(X))
					return (
						console.error('Unknown event handler property `%s`. It will be ignored.', X),
						(b2[X] = !0)
					);
			} else if (tH.test(X))
				return (
					mq.test(X) &&
						console.error(
							'Invalid event handler property `%s`. React events use the camelCase naming convention, for example `onClick`.',
							X,
						),
					(b2[X] = !0)
				);
			if (yq.test(X) || fq.test(X)) return !0;
			if (Y === 'innerhtml')
				return (
					console.error(
						'Directly setting property `innerHTML` is not permitted. For more information, lookup documentation on `dangerouslySetInnerHTML`.',
					),
					(b2[X] = !0)
				);
			if (Y === 'aria')
				return (
					console.error(
						'The `aria` attribute is reserved for future use in React. Pass individual `aria-` attributes instead.',
					),
					(b2[X] = !0)
				);
			if (Y === 'is' && G !== null && G !== void 0 && typeof G !== 'string')
				return (
					console.error(
						'Received a `%s` for a string attribute `is`. If this is expected, cast the value to a string.',
						typeof G,
					),
					(b2[X] = !0)
				);
			if (typeof G === 'number' && isNaN(G))
				return (
					console.error(
						'Received NaN for the `%s` attribute. If this is expected, cast the value to a string.',
						X,
					),
					(b2[X] = !0)
				);
			if (d7.hasOwnProperty(Y)) {
				if (((Y = d7[Y]), Y !== X))
					return (
						console.error('Invalid DOM property `%s`. Did you mean `%s`?', X, Y),
						(b2[X] = !0)
					);
			} else if (X !== Y)
				return (
					console.error(
						'React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element.',
						X,
						Y,
					),
					(b2[X] = !0)
				);
			switch (X) {
				case 'dangerouslySetInnerHTML':
				case 'children':
				case 'style':
				case 'suppressContentEditableWarning':
				case 'suppressHydrationWarning':
				case 'defaultValue':
				case 'defaultChecked':
				case 'innerHTML':
				case 'ref':
					return !0;
				case 'innerText':
				case 'textContent':
					return !0;
			}
			switch (typeof G) {
				case 'boolean':
					switch (X) {
						case 'autoFocus':
						case 'checked':
						case 'multiple':
						case 'muted':
						case 'selected':
						case 'contentEditable':
						case 'spellCheck':
						case 'draggable':
						case 'value':
						case 'autoReverse':
						case 'externalResourcesRequired':
						case 'focusable':
						case 'preserveAlpha':
						case 'allowFullScreen':
						case 'async':
						case 'autoPlay':
						case 'controls':
						case 'default':
						case 'defer':
						case 'disabled':
						case 'disablePictureInPicture':
						case 'disableRemotePlayback':
						case 'formNoValidate':
						case 'hidden':
						case 'loop':
						case 'noModule':
						case 'noValidate':
						case 'open':
						case 'playsInline':
						case 'readOnly':
						case 'required':
						case 'reversed':
						case 'scoped':
						case 'seamless':
						case 'itemScope':
						case 'capture':
						case 'download':
						case 'inert':
							return !0;
						default:
							if (((Y = X.toLowerCase().slice(0, 5)), Y === 'data-' || Y === 'aria-')) return !0;
							return (
								G
									? console.error(
											'Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.',
											G,
											X,
											X,
											G,
											X,
										)
									: console.error(
											'Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.\n\nIf you used to conditionally omit it with %s={condition && value}, pass %s={condition ? value : undefined} instead.',
											G,
											X,
											X,
											G,
											X,
											X,
											X,
										),
								(b2[X] = !0)
							);
					}
				case 'function':
				case 'symbol':
					return ((b2[X] = !0), !1);
				case 'string':
					if (G === 'false' || G === 'true') {
						switch (X) {
							case 'checked':
							case 'selected':
							case 'multiple':
							case 'muted':
							case 'allowFullScreen':
							case 'async':
							case 'autoPlay':
							case 'controls':
							case 'default':
							case 'defer':
							case 'disabled':
							case 'disablePictureInPicture':
							case 'disableRemotePlayback':
							case 'formNoValidate':
							case 'hidden':
							case 'loop':
							case 'noModule':
							case 'noValidate':
							case 'open':
							case 'playsInline':
							case 'readOnly':
							case 'required':
							case 'reversed':
							case 'scoped':
							case 'seamless':
							case 'itemScope':
							case 'inert':
								break;
							default:
								return !0;
						}
						(console.error(
							'Received the string `%s` for the boolean attribute `%s`. %s Did you mean %s={%s}?',
							G,
							X,
							G === 'false'
								? 'The browser will interpret it as a truthy value.'
								: 'Although this works, it will not work as expected if you pass the string "false".',
							X,
							G,
						),
							(b2[X] = !0));
					}
			}
			return !0;
		}
		function DQ(B, X, G) {
			var Z = [],
				Y;
			for (Y in X) CQ(B, Y, X[Y], G) || Z.push(Y);
			((X = Z.map(function ($) {
				return '`' + $ + '`';
			}).join(', ')),
				Z.length === 1
					? console.error(
							'Invalid value for prop %s on <%s> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior ',
							X,
							B,
						)
					: 1 < Z.length &&
						console.error(
							'Invalid values for props %s on <%s> tag. Either remove them from the element, or pass a string or number value to keep them in the DOM. For details, see https://react.dev/link/attribute-behavior ',
							X,
							B,
						));
		}
		function nX(B) {
			return uq.test('' + B)
				? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
				: B;
		}
		function E6() {}
		function n9(B) {
			return (
				(B = B.target || B.srcElement || window),
				B.correspondingUseElement && (B = B.correspondingUseElement),
				B.nodeType === 3 ? B.parentNode : B
			);
		}
		function sY(B) {
			var X = n(B);
			if (X && (B = X.stateNode)) {
				var G = B[k2] || null;
				B: switch (((B = X.stateNode), X.type)) {
					case 'input':
						if (
							(d9(
								B,
								G.value,
								G.defaultValue,
								G.defaultValue,
								G.checked,
								G.defaultChecked,
								G.type,
								G.name,
							),
							(X = G.name),
							G.type === 'radio' && X != null)
						) {
							for (G = B; G.parentNode;) G = G.parentNode;
							(V0(X, 'name'),
								(G = G.querySelectorAll('input[name="' + A5('' + X) + '"][type="radio"]')));
							for (X = 0; X < G.length; X++) {
								var Z = G[X];
								if (Z !== B && Z.form === B.form) {
									var Y = Z[k2] || null;
									if (!Y)
										throw Error(
											'ReactDOMInput: Mixing React and non-React radio inputs with the same `name` is not supported.',
										);
									d9(
										Z,
										Y.value,
										Y.defaultValue,
										Y.defaultValue,
										Y.checked,
										Y.defaultChecked,
										Y.type,
										Y.name,
									);
								}
							}
							for (X = 0; X < G.length; X++) ((Z = G[X]), Z.form === B.form && xY(Z));
						}
						break B;
					case 'textarea':
						TY(B, G.value, G.defaultValue);
						break B;
					case 'select':
						((X = G.value), X != null && f1(B, !!G.multiple, X, !1));
				}
			}
		}
		function lY(B, X, G) {
			if (UZ) return B(X, G);
			UZ = !0;
			try {
				var Z = B(X);
				return Z;
			} finally {
				if (((UZ = !1), UX !== null || QX !== null)) {
					if ((t1(), UX && ((X = UX), (B = QX), (QX = UX = null), sY(X), B)))
						for (X = 0; X < B.length; X++) sY(B[X]);
				}
			}
		}
		function iX(B, X) {
			var G = B.stateNode;
			if (G === null) return null;
			var Z = G[k2] || null;
			if (Z === null) return null;
			G = Z[X];
			B: switch (X) {
				case 'onClick':
				case 'onClickCapture':
				case 'onDoubleClick':
				case 'onDoubleClickCapture':
				case 'onMouseDown':
				case 'onMouseDownCapture':
				case 'onMouseMove':
				case 'onMouseMoveCapture':
				case 'onMouseUp':
				case 'onMouseUpCapture':
				case 'onMouseEnter':
					((Z = !Z.disabled) ||
						((B = B.type),
						(Z = !(B === 'button' || B === 'input' || B === 'select' || B === 'textarea'))),
						(B = !Z));
					break B;
				default:
					B = !1;
			}
			if (B) return null;
			if (G && typeof G !== 'function')
				throw Error(
					'Expected `' +
						X +
						'` listener to be a function, instead got a value of `' +
						typeof G +
						'` type.',
				);
			return G;
		}
		function pY() {
			if (s7) return s7;
			var B,
				X = MZ,
				G = X.length,
				Z,
				Y = 'value' in OB ? OB.value : OB.textContent,
				$ = Y.length;
			for (B = 0; B < G && X[B] === Y[B]; B++);
			var R = G - B;
			for (Z = 1; Z <= R && X[G - Z] === Y[$ - Z]; Z++);
			return (s7 = Y.slice(B, 1 < Z ? 1 - Z : void 0));
		}
		function D4(B) {
			var X = B.keyCode;
			return (
				'charCode' in B ? ((B = B.charCode), B === 0 && X === 13 && (B = 13)) : (B = X),
				B === 10 && (B = 13),
				32 <= B || B === 13 ? B : 0
			);
		}
		function T4() {
			return !0;
		}
		function cY() {
			return !1;
		}
		function d2(B) {
			function X(G, Z, Y, $, R) {
				((this._reactName = G),
					(this._targetInst = Y),
					(this.type = Z),
					(this.nativeEvent = $),
					(this.target = R),
					(this.currentTarget = null));
				for (var z in B) B.hasOwnProperty(z) && ((G = B[z]), (this[z] = G ? G($) : $[z]));
				return (
					(this.isDefaultPrevented = (
						$.defaultPrevented != null ? $.defaultPrevented : $.returnValue === !1
					)
						? T4
						: cY),
					(this.isPropagationStopped = cY),
					this
				);
			}
			return (
				Y0(X.prototype, {
					preventDefault: function () {
						this.defaultPrevented = !0;
						var G = this.nativeEvent;
						G &&
							(G.preventDefault
								? G.preventDefault()
								: typeof G.returnValue !== 'unknown' && (G.returnValue = !1),
							(this.isDefaultPrevented = T4));
					},
					stopPropagation: function () {
						var G = this.nativeEvent;
						G &&
							(G.stopPropagation
								? G.stopPropagation()
								: typeof G.cancelBubble !== 'unknown' && (G.cancelBubble = !0),
							(this.isPropagationStopped = T4));
					},
					persist: function () {},
					isPersistent: T4,
				}),
				X
			);
		}
		function TQ(B) {
			var X = this.nativeEvent;
			return X.getModifierState ? X.getModifierState(B) : (B = eq[B]) ? !!X[B] : !1;
		}
		function i9() {
			return TQ;
		}
		function aY(B, X) {
			switch (B) {
				case 'keyup':
					return QW.indexOf(X.keyCode) !== -1;
				case 'keydown':
					return X.keyCode !== XJ;
				case 'keypress':
				case 'mousedown':
				case 'focusout':
					return !0;
				default:
					return !1;
			}
		}
		function oY(B) {
			return ((B = B.detail), typeof B === 'object' && 'data' in B ? B.data : null);
		}
		function vQ(B, X) {
			switch (B) {
				case 'compositionend':
					return oY(X);
				case 'keypress':
					if (X.which !== ZJ) return null;
					return (($J = !0), YJ);
				case 'textInput':
					return ((B = X.data), B === YJ && $J ? null : B);
				default:
					return null;
			}
		}
		function SQ(B, X) {
			if (MX)
				return B === 'compositionend' || (!KZ && aY(B, X))
					? ((B = pY()), (s7 = MZ = OB = null), (MX = !1), B)
					: null;
			switch (B) {
				case 'paste':
					return null;
				case 'keypress':
					if (!(X.ctrlKey || X.altKey || X.metaKey) || (X.ctrlKey && X.altKey)) {
						if (X.char && 1 < X.char.length) return X.char;
						if (X.which) return String.fromCharCode(X.which);
					}
					return null;
				case 'compositionend':
					return GJ && X.locale !== 'ko' ? null : X.data;
				default:
					return null;
			}
		}
		function nY(B) {
			var X = B && B.nodeName && B.nodeName.toLowerCase();
			return X === 'input' ? !!qW[B.type] : X === 'textarea' ? !0 : !1;
		}
		function gQ(B) {
			if (!O6) return !1;
			B = 'on' + B;
			var X = B in document;
			return (
				X ||
					((X = document.createElement('div')),
					X.setAttribute(B, 'return;'),
					(X = typeof X[B] === 'function')),
				X
			);
		}
		function iY(B, X, G, Z) {
			(UX ? (QX ? QX.push(Z) : (QX = [Z])) : (UX = Z),
				(X = P7(X, 'onChange')),
				0 < X.length &&
					((G = new l7('onChange', 'change', null, G, Z)), B.push({ event: G, listeners: X })));
		}
		function kQ(B) {
			vz(B, 0);
		}
		function v4(B) {
			var X = i(B);
			if (xY(X)) return B;
		}
		function tY(B, X) {
			if (B === 'change') return X;
		}
		function rY() {
			k3 && (k3.detachEvent('onpropertychange', eY), (b3 = k3 = null));
		}
		function eY(B) {
			if (B.propertyName === 'value' && v4(b3)) {
				var X = [];
				(iY(X, b3, B, n9(B)), lY(kQ, X));
			}
		}
		function bQ(B, X, G) {
			B === 'focusin'
				? (rY(), (k3 = X), (b3 = G), k3.attachEvent('onpropertychange', eY))
				: B === 'focusout' && rY();
		}
		function mQ(B) {
			if (B === 'selectionchange' || B === 'keyup' || B === 'keydown') return v4(b3);
		}
		function yQ(B, X) {
			if (B === 'click') return v4(X);
		}
		function fQ(B, X) {
			if (B === 'input' || B === 'change') return v4(X);
		}
		function uQ(B, X) {
			return (B === X && (B !== 0 || 1 / B === 1 / X)) || (B !== B && X !== X);
		}
		function tX(B, X) {
			if (m2(B, X)) return !0;
			if (typeof B !== 'object' || B === null || typeof X !== 'object' || X === null) return !1;
			var G = Object.keys(B),
				Z = Object.keys(X);
			if (G.length !== Z.length) return !1;
			for (Z = 0; Z < G.length; Z++) {
				var Y = G[Z];
				if (!m5.call(X, Y) || !m2(B[Y], X[Y])) return !1;
			}
			return !0;
		}
		function B$(B) {
			for (; B && B.firstChild;) B = B.firstChild;
			return B;
		}
		function X$(B, X) {
			var G = B$(B);
			B = 0;
			for (var Z; G;) {
				if (G.nodeType === 3) {
					if (((Z = B + G.textContent.length), B <= X && Z >= X)) return { node: G, offset: X - B };
					B = Z;
				}
				B: {
					for (; G;) {
						if (G.nextSibling) {
							G = G.nextSibling;
							break B;
						}
						G = G.parentNode;
					}
					G = void 0;
				}
				G = B$(G);
			}
		}
		function G$(B, X) {
			return B && X
				? B === X
					? !0
					: B && B.nodeType === 3
						? !1
						: X && X.nodeType === 3
							? G$(B, X.parentNode)
							: 'contains' in B
								? B.contains(X)
								: B.compareDocumentPosition
									? !!(B.compareDocumentPosition(X) & 16)
									: !1
				: !1;
		}
		function Z$(B) {
			B =
				B != null && B.ownerDocument != null && B.ownerDocument.defaultView != null
					? B.ownerDocument.defaultView
					: window;
			for (var X = I4(B.document); X instanceof B.HTMLIFrameElement;) {
				try {
					var G = typeof X.contentWindow.location.href === 'string';
				} catch (Z) {
					G = !1;
				}
				if (G) B = X.contentWindow;
				else break;
				X = I4(B.document);
			}
			return X;
		}
		function t9(B) {
			var X = B && B.nodeName && B.nodeName.toLowerCase();
			return (
				X &&
				((X === 'input' &&
					(B.type === 'text' ||
						B.type === 'search' ||
						B.type === 'tel' ||
						B.type === 'url' ||
						B.type === 'password')) ||
					X === 'textarea' ||
					B.contentEditable === 'true')
			);
		}
		function Y$(B, X, G) {
			var Z = G.window === G ? G.document : G.nodeType === 9 ? G : G.ownerDocument;
			_Z ||
				qX == null ||
				qX !== I4(Z) ||
				((Z = qX),
				'selectionStart' in Z && t9(Z)
					? (Z = { start: Z.selectionStart, end: Z.selectionEnd })
					: ((Z = ((Z.ownerDocument && Z.ownerDocument.defaultView) || window).getSelection()),
						(Z = {
							anchorNode: Z.anchorNode,
							anchorOffset: Z.anchorOffset,
							focusNode: Z.focusNode,
							focusOffset: Z.focusOffset,
						})),
				(m3 && tX(m3, Z)) ||
					((m3 = Z),
					(Z = P7(OZ, 'onSelect')),
					0 < Z.length &&
						((X = new l7('onSelect', 'select', null, X, G)),
						B.push({ event: X, listeners: Z }),
						(X.target = qX))));
		}
		function nB(B, X) {
			var G = {};
			return (
				(G[B.toLowerCase()] = X.toLowerCase()),
				(G['Webkit' + B] = 'webkit' + X),
				(G['Moz' + B] = 'moz' + X),
				G
			);
		}
		function iB(B) {
			if (LZ[B]) return LZ[B];
			if (!WX[B]) return B;
			var X = WX[B],
				G;
			for (G in X) if (X.hasOwnProperty(G) && G in zJ) return (LZ[B] = X[G]);
			return B;
		}
		function g5(B, X) {
			(MJ.set(B, X), V2(X, [B]));
		}
		function hQ(B) {
			for (var X = c7, G = 0; G < B.length; G++) {
				var Z = B[G];
				if (typeof Z === 'object' && Z !== null)
					if (Q2(Z) && Z.length === 2 && typeof Z[0] === 'string') {
						if (X !== c7 && X !== xZ) return FZ;
						X = xZ;
					} else return FZ;
				else {
					if (
						typeof Z === 'function' ||
						(typeof Z === 'string' && 50 < Z.length) ||
						(X !== c7 && X !== PZ)
					)
						return FZ;
					X = PZ;
				}
			}
			return X;
		}
		function r9(B, X, G, Z) {
			for (var Y in B) m5.call(B, Y) && Y[0] !== '_' && n5(Y, B[Y], X, G, Z);
		}
		function n5(B, X, G, Z, Y) {
			switch (typeof X) {
				case 'object':
					if (X === null) {
						X = 'null';
						break;
					} else {
						if (X.$$typeof === Q6) {
							var $ = J0(X.type) || '…',
								R = X.key;
							X = X.props;
							var z = Object.keys(X),
								H = z.length;
							if (R == null && H === 0) {
								X = '<' + $ + ' />';
								break;
							}
							if (3 > Z || (H === 1 && z[0] === 'children' && R == null)) {
								X = '<' + $ + ' … />';
								break;
							}
							(G.push([Y + '  '.repeat(Z) + B, '<' + $]),
								R !== null && n5('key', R, G, Z + 1, Y),
								(B = !1));
							for (var J in X)
								J === 'children'
									? X.children != null && (!Q2(X.children) || 0 < X.children.length) && (B = !0)
									: m5.call(X, J) && J[0] !== '_' && n5(J, X[J], G, Z + 1, Y);
							G.push(['', B ? '>…</' + $ + '>' : '/>']);
							return;
						}
						if (
							(($ = Object.prototype.toString.call(X)),
							($ = $.slice(8, $.length - 1)),
							$ === 'Array')
						) {
							if (((J = hQ(X)), J === PZ || J === c7)) {
								X = JSON.stringify(X);
								break;
							} else if (J === xZ) {
								G.push([Y + '  '.repeat(Z) + B, '']);
								for (B = 0; B < X.length; B++) (($ = X[B]), n5($[0], $[1], G, Z + 1, Y));
								return;
							}
						}
						if ($ === 'Promise') {
							if (X.status === 'fulfilled') {
								if ((($ = G.length), n5(B, X.value, G, Z, Y), G.length > $)) {
									((G = G[$]), (G[1] = 'Promise<' + (G[1] || 'Object') + '>'));
									return;
								}
							} else if (
								X.status === 'rejected' &&
								(($ = G.length), n5(B, X.reason, G, Z, Y), G.length > $)
							) {
								((G = G[$]), (G[1] = 'Rejected Promise<' + G[1] + '>'));
								return;
							}
							G.push(['  '.repeat(Z) + B, 'Promise']);
							return;
						}
						($ === 'Object' &&
							(J = Object.getPrototypeOf(X)) &&
							typeof J.constructor === 'function' &&
							($ = J.constructor.name),
							G.push([Y + '  '.repeat(Z) + B, $ === 'Object' ? (3 > Z ? '' : '…') : $]),
							3 > Z && r9(X, G, Z + 1, Y));
						return;
					}
				case 'function':
					X = X.name === '' ? '() => {}' : X.name + '() {}';
					break;
				case 'string':
					X = X === AW ? '…' : JSON.stringify(X);
					break;
				case 'undefined':
					X = 'undefined';
					break;
				case 'boolean':
					X = X ? 'true' : 'false';
					break;
				default:
					X = String(X);
			}
			G.push([Y + '  '.repeat(Z) + B, X]);
		}
		function $$(B, X, G, Z) {
			var Y = !0;
			for (R in B) R in X || (G.push([a7 + '  '.repeat(Z) + R, '…']), (Y = !1));
			for (var $ in X)
				if ($ in B) {
					var R = B[$],
						z = X[$];
					if (R !== z) {
						if (Z === 0 && $ === 'children')
							((Y = '  '.repeat(Z) + $), G.push([a7 + Y, '…'], [o7 + Y, '…']));
						else {
							if (!(3 <= Z)) {
								if (
									typeof R === 'object' &&
									typeof z === 'object' &&
									R !== null &&
									z !== null &&
									R.$$typeof === z.$$typeof
								)
									if (z.$$typeof === Q6) {
										if (R.type === z.type && R.key === z.key) {
											((R = J0(z.type) || '…'),
												(Y = '  '.repeat(Z) + $),
												(R = '<' + R + ' … />'),
												G.push([a7 + Y, R], [o7 + Y, R]),
												(Y = !1));
											continue;
										}
									} else {
										var H = Object.prototype.toString.call(R),
											J = Object.prototype.toString.call(z);
										if (H === J && (J === '[object Object]' || J === '[object Array]')) {
											((H = [wJ + '  '.repeat(Z) + $, J === '[object Array]' ? 'Array' : '']),
												G.push(H),
												(J = G.length),
												$$(R, z, G, Z + 1)
													? J === G.length &&
														(H[1] =
															'Referentially unequal but deeply equal objects. Consider memoization.')
													: (Y = !1));
											continue;
										}
									}
								else if (
									typeof R === 'function' &&
									typeof z === 'function' &&
									R.name === z.name &&
									R.length === z.length &&
									((H = Function.prototype.toString.call(R)),
									(J = Function.prototype.toString.call(z)),
									H === J)
								) {
									((R = z.name === '' ? '() => {}' : z.name + '() {}'),
										G.push([
											wJ + '  '.repeat(Z) + $,
											R + ' Referentially unequal function closure. Consider memoization.',
										]));
									continue;
								}
							}
							(n5($, R, G, Z, a7), n5($, z, G, Z, o7));
						}
						Y = !1;
					}
				} else (G.push([o7 + '  '.repeat(Z) + $, '…']), (Y = !1));
			return Y;
		}
		function G5(B) {
			R0 =
				B & 63
					? 'Blocking'
					: B & 64
						? 'Gesture'
						: B & 4194176
							? 'Transition'
							: B & 62914560
								? 'Suspense'
								: B & 2080374784
									? 'Idle'
									: 'Other';
		}
		function i5(B, X, G, Z) {
			y0 &&
				((LB.start = X),
				(LB.end = G),
				(k6.color = 'warning'),
				(k6.tooltipText = Z),
				(k6.properties = null),
				(B = B._debugTask)
					? B.run(performance.measure.bind(performance, Z, LB))
					: performance.measure(Z, LB));
		}
		function S4(B, X, G) {
			i5(B, X, G, 'Reconnect');
		}
		function g4(B, X, G, Z, Y) {
			var $ = v(B);
			if ($ !== null && y0) {
				var { alternate: R, actualDuration: z } = B;
				if (R === null || R.child !== B.child)
					for (var H = B.child; H !== null; H = H.sibling) z -= H.actualDuration;
				Z =
					0.5 > z
						? Z
							? 'tertiary-light'
							: 'primary-light'
						: 10 > z
							? Z
								? 'tertiary'
								: 'primary'
							: 100 > z
								? Z
									? 'tertiary-dark'
									: 'primary-dark'
								: 'error';
				var J = B.memoizedProps;
				((z = B._debugTask),
					J !== null && R !== null && R.memoizedProps !== J
						? ((H = [jW]),
							(J = $$(R.memoizedProps, J, H, 0)),
							1 < H.length &&
								(J && !_B && (R.lanes & Y) === 0 && 100 < B.actualDuration
									? ((_B = !0), (H[0] = FW), (k6.color = 'warning'), (k6.tooltipText = KJ))
									: ((k6.color = Z), (k6.tooltipText = $)),
								(k6.properties = H),
								(LB.start = X),
								(LB.end = G),
								z != null
									? z.run(performance.measure.bind(performance, '​' + $, LB))
									: performance.measure('​' + $, LB)))
						: z != null
							? z.run(console.timeStamp.bind(console, $, X, G, F5, void 0, Z))
							: console.timeStamp($, X, G, F5, void 0, Z));
			}
		}
		function e9(B, X, G, Z) {
			if (y0) {
				var Y = v(B);
				if (Y !== null) {
					for (var $ = null, R = [], z = 0; z < Z.length; z++) {
						var H = Z[z];
						($ == null && H.source !== null && ($ = H.source._debugTask),
							(H = H.value),
							R.push([
								'Error',
								typeof H === 'object' && H !== null && typeof H.message === 'string'
									? String(H.message)
									: String(H),
							]));
					}
					(B.key !== null && n5('key', B.key, R, 0, ''),
						B.memoizedProps !== null && r9(B.memoizedProps, R, 0, ''),
						$ == null && ($ = B._debugTask),
						(B = {
							start: X,
							end: G,
							detail: {
								devtools: {
									color: 'error',
									track: F5,
									tooltipText: B.tag === 13 ? 'Hydration failed' : 'Error boundary caught an error',
									properties: R,
								},
							},
						}),
						$
							? $.run(performance.measure.bind(performance, '​' + Y, B))
							: performance.measure('​' + Y, B));
				}
			}
		}
		function t5(B, X, G, Z, Y) {
			if (Y !== null) {
				if (y0) {
					var $ = v(B);
					if ($ !== null) {
						Z = [];
						for (var R = 0; R < Y.length; R++) {
							var z = Y[R].value;
							Z.push([
								'Error',
								typeof z === 'object' && z !== null && typeof z.message === 'string'
									? String(z.message)
									: String(z),
							]);
						}
						(B.key !== null && n5('key', B.key, Z, 0, ''),
							B.memoizedProps !== null && r9(B.memoizedProps, Z, 0, ''),
							(X = {
								start: X,
								end: G,
								detail: {
									devtools: {
										color: 'error',
										track: F5,
										tooltipText: 'A lifecycle or effect errored',
										properties: Z,
									},
								},
							}),
							(B = B._debugTask)
								? B.run(performance.measure.bind(performance, '​' + $, X))
								: performance.measure('​' + $, X));
					}
				}
			} else
				(($ = v(B)),
					$ !== null &&
						y0 &&
						((Y =
							1 > Z
								? 'secondary-light'
								: 100 > Z
									? 'secondary'
									: 500 > Z
										? 'secondary-dark'
										: 'error'),
						(B = B._debugTask)
							? B.run(console.timeStamp.bind(console, $, X, G, F5, void 0, Y))
							: console.timeStamp($, X, G, F5, void 0, Y)));
		}
		function dQ(B, X, G, Z) {
			if (y0 && !(X <= B)) {
				var Y = (G & 738197653) === G ? 'tertiary-dark' : 'primary-dark';
				((G = (G & 536870912) === G ? 'Prepared' : (G & 201326741) === G ? 'Hydrated' : 'Render'),
					Z
						? Z.run(console.timeStamp.bind(console, G, B, X, R0, $0, Y))
						: console.timeStamp(G, B, X, R0, $0, Y));
			}
		}
		function R$(B, X, G, Z) {
			!y0 ||
				X <= B ||
				((G = (G & 738197653) === G ? 'tertiary-dark' : 'primary-dark'),
				Z
					? Z.run(console.timeStamp.bind(console, 'Prewarm', B, X, R0, $0, G))
					: console.timeStamp('Prewarm', B, X, R0, $0, G));
		}
		function z$(B, X, G, Z) {
			!y0 ||
				X <= B ||
				((G = (G & 738197653) === G ? 'tertiary-dark' : 'primary-dark'),
				Z
					? Z.run(console.timeStamp.bind(console, 'Suspended', B, X, R0, $0, G))
					: console.timeStamp('Suspended', B, X, R0, $0, G));
		}
		function sQ(B, X, G, Z, Y, $) {
			if (y0 && !(X <= B)) {
				G = [];
				for (var R = 0; R < Z.length; R++) {
					var z = Z[R].value;
					G.push([
						'Recoverable Error',
						typeof z === 'object' && z !== null && typeof z.message === 'string'
							? String(z.message)
							: String(z),
					]);
				}
				((B = {
					start: B,
					end: X,
					detail: {
						devtools: {
							color: 'primary-dark',
							track: R0,
							trackGroup: $0,
							tooltipText: Y ? 'Hydration Failed' : 'Recovered after Error',
							properties: G,
						},
					},
				}),
					$
						? $.run(performance.measure.bind(performance, 'Recovered', B))
						: performance.measure('Recovered', B));
			}
		}
		function BG(B, X, G, Z) {
			!y0 ||
				X <= B ||
				(Z
					? Z.run(console.timeStamp.bind(console, 'Errored', B, X, R0, $0, 'error'))
					: console.timeStamp('Errored', B, X, R0, $0, 'error'));
		}
		function lQ(B, X, G, Z) {
			!y0 ||
				X <= B ||
				(Z
					? Z.run(console.timeStamp.bind(console, G, B, X, R0, $0, 'secondary-light'))
					: console.timeStamp(G, B, X, R0, $0, 'secondary-light'));
		}
		function H$(B, X, G, Z, Y) {
			if (y0 && !(X <= B)) {
				for (var $ = [], R = 0; R < G.length; R++) {
					var z = G[R].value;
					$.push([
						'Error',
						typeof z === 'object' && z !== null && typeof z.message === 'string'
							? String(z.message)
							: String(z),
					]);
				}
				((B = {
					start: B,
					end: X,
					detail: {
						devtools: {
							color: 'error',
							track: R0,
							trackGroup: $0,
							tooltipText: Z ? 'Remaining Effects Errored' : 'Commit Errored',
							properties: $,
						},
					},
				}),
					Y
						? Y.run(performance.measure.bind(performance, 'Errored', B))
						: performance.measure('Errored', B));
			}
		}
		function rX(B, X, G) {
			!y0 ||
				X <= B ||
				(G
					? G.run(console.timeStamp.bind(console, 'Animating', B, X, R0, $0, 'secondary-dark'))
					: console.timeStamp('Animating', B, X, R0, $0, 'secondary-dark'));
		}
		function k4() {
			for (var B = wX, X = (NZ = wX = 0); X < B;) {
				var G = P5[X];
				P5[X++] = null;
				var Z = P5[X];
				P5[X++] = null;
				var Y = P5[X];
				P5[X++] = null;
				var $ = P5[X];
				if (((P5[X++] = null), Z !== null && Y !== null)) {
					var R = Z.pending;
					(R === null ? (Y.next = Y) : ((Y.next = R.next), (R.next = Y)), (Z.pending = Y));
				}
				$ !== 0 && J$(G, Y, $);
			}
		}
		function b4(B, X, G, Z) {
			((P5[wX++] = B),
				(P5[wX++] = X),
				(P5[wX++] = G),
				(P5[wX++] = Z),
				(NZ |= Z),
				(B.lanes |= Z),
				(B = B.alternate),
				B !== null && (B.lanes |= Z));
		}
		function XG(B, X, G, Z) {
			return (b4(B, X, G, Z), m4(B));
		}
		function C2(B, X) {
			return (b4(B, null, null, X), m4(B));
		}
		function J$(B, X, G) {
			B.lanes |= G;
			var Z = B.alternate;
			Z !== null && (Z.lanes |= G);
			for (var Y = !1, $ = B.return; $ !== null;)
				(($.childLanes |= G),
					(Z = $.alternate),
					Z !== null && (Z.childLanes |= G),
					$.tag === 22 && ((B = $.stateNode), B === null || B._visibility & y3 || (Y = !0)),
					(B = $),
					($ = $.return));
			return B.tag === 3
				? (($ = B.stateNode),
					Y &&
						X !== null &&
						((Y = 31 - g2(G)),
						(B = $.hiddenUpdates),
						(Z = B[Y]),
						Z === null ? (B[Y] = [X]) : Z.push(X),
						(X.lane = G | 536870912)),
					$)
				: null;
		}
		function m4(B) {
			if (Q4 > mW)
				throw (
					(N1 = Q4 = 0),
					(M4 = YY = null),
					Error(
						'Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.',
					)
				);
			(N1 > yW &&
				((N1 = 0),
				(M4 = null),
				console.error(
					"Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.",
				)),
				B.alternate === null && (B.flags & 4098) !== 0 && Nz(B));
			for (var X = B, G = X.return; G !== null;)
				(X.alternate === null && (X.flags & 4098) !== 0 && Nz(B), (X = G), (G = X.return));
			return X.tag === 3 ? X.stateNode : null;
		}
		function tB(B) {
			if (x5 === null) return B;
			var X = x5(B);
			return X === void 0 ? B : X.current;
		}
		function GG(B) {
			if (x5 === null) return B;
			var X = x5(B);
			return X === void 0
				? B !== null &&
					B !== void 0 &&
					typeof B.render === 'function' &&
					((X = tB(B.render)), B.render !== X)
					? ((X = { $$typeof: E3, render: X }),
						B.displayName !== void 0 && (X.displayName = B.displayName),
						X)
					: B
				: X.current;
		}
		function U$(B, X) {
			if (x5 === null) return !1;
			var G = B.elementType;
			X = X.type;
			var Z = !1,
				Y = typeof X === 'object' && X !== null ? X.$$typeof : null;
			switch (B.tag) {
				case 1:
					typeof X === 'function' && (Z = !0);
					break;
				case 0:
					typeof X === 'function' ? (Z = !0) : Y === J5 && (Z = !0);
					break;
				case 11:
					Y === E3 ? (Z = !0) : Y === J5 && (Z = !0);
					break;
				case 14:
				case 15:
					Y === g7 ? (Z = !0) : Y === J5 && (Z = !0);
					break;
				default:
					return !1;
			}
			return Z && ((B = x5(G)), B !== void 0 && B === x5(X)) ? !0 : !1;
		}
		function Q$(B) {
			x5 !== null &&
				typeof WeakSet === 'function' &&
				(KX === null && (KX = new WeakSet()), KX.add(B));
		}
		function M$(B, X, G) {
			do {
				var Z = B,
					Y = Z.alternate,
					$ = Z.child,
					R = Z.sibling,
					z = Z.tag;
				Z = Z.type;
				var H = null;
				switch (z) {
					case 0:
					case 15:
					case 1:
						H = Z;
						break;
					case 11:
						H = Z.render;
				}
				if (x5 === null) throw Error('Expected resolveFamily to be set during hot reload.');
				var J = !1;
				if (
					((Z = !1),
					H !== null &&
						((H = x5(H)),
						H !== void 0 && (G.has(H) ? (Z = !0) : X.has(H) && (z === 1 ? (Z = !0) : (J = !0)))),
					KX !== null && (KX.has(B) || (Y !== null && KX.has(Y))) && (Z = !0),
					Z && (B._debugNeedsRemount = !0),
					Z || J)
				)
					((Y = C2(B, 2)), Y !== null && n0(Y, B, 2));
				if (($ === null || Z || M$($, X, G), R === null)) break;
				B = R;
			} while (1);
		}
		function pQ(B, X, G, Z) {
			((this.tag = B),
				(this.key = G),
				(this.sibling =
					this.child =
					this.return =
					this.stateNode =
					this.type =
					this.elementType =
						null),
				(this.index = 0),
				(this.refCleanup = this.ref = null),
				(this.pendingProps = X),
				(this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null),
				(this.mode = Z),
				(this.subtreeFlags = this.flags = 0),
				(this.deletions = null),
				(this.childLanes = this.lanes = 0),
				(this.alternate = null),
				(this.actualDuration = -0),
				(this.actualStartTime = -1.1),
				(this.treeBaseDuration = this.selfBaseDuration = -0),
				(this._debugTask = this._debugStack = this._debugOwner = this._debugInfo = null),
				(this._debugNeedsRemount = !1),
				(this._debugHookTypes = null),
				OJ || typeof Object.preventExtensions !== 'function' || Object.preventExtensions(this));
		}
		function ZG(B) {
			return ((B = B.prototype), !(!B || !B.isReactComponent));
		}
		function I6(B, X) {
			var G = B.alternate;
			switch (
				(G === null
					? ((G = g(B.tag, X, B.key, B.mode)),
						(G.elementType = B.elementType),
						(G.type = B.type),
						(G.stateNode = B.stateNode),
						(G._debugOwner = B._debugOwner),
						(G._debugStack = B._debugStack),
						(G._debugTask = B._debugTask),
						(G._debugHookTypes = B._debugHookTypes),
						(G.alternate = B),
						(B.alternate = G))
					: ((G.pendingProps = X),
						(G.type = B.type),
						(G.flags = 0),
						(G.subtreeFlags = 0),
						(G.deletions = null),
						(G.actualDuration = -0),
						(G.actualStartTime = -1.1)),
				(G.flags = B.flags & 65011712),
				(G.childLanes = B.childLanes),
				(G.lanes = B.lanes),
				(G.child = B.child),
				(G.memoizedProps = B.memoizedProps),
				(G.memoizedState = B.memoizedState),
				(G.updateQueue = B.updateQueue),
				(X = B.dependencies),
				(G.dependencies =
					X === null
						? null
						: {
								lanes: X.lanes,
								firstContext: X.firstContext,
								_debugThenableState: X._debugThenableState,
							}),
				(G.sibling = B.sibling),
				(G.index = B.index),
				(G.ref = B.ref),
				(G.refCleanup = B.refCleanup),
				(G.selfBaseDuration = B.selfBaseDuration),
				(G.treeBaseDuration = B.treeBaseDuration),
				(G._debugInfo = B._debugInfo),
				(G._debugNeedsRemount = B._debugNeedsRemount),
				G.tag)
			) {
				case 0:
				case 15:
					G.type = tB(B.type);
					break;
				case 1:
					G.type = tB(B.type);
					break;
				case 11:
					G.type = GG(B.type);
			}
			return G;
		}
		function q$(B, X) {
			B.flags &= 65011714;
			var G = B.alternate;
			return (
				G === null
					? ((B.childLanes = 0),
						(B.lanes = X),
						(B.child = null),
						(B.subtreeFlags = 0),
						(B.memoizedProps = null),
						(B.memoizedState = null),
						(B.updateQueue = null),
						(B.dependencies = null),
						(B.stateNode = null),
						(B.selfBaseDuration = 0),
						(B.treeBaseDuration = 0))
					: ((B.childLanes = G.childLanes),
						(B.lanes = G.lanes),
						(B.child = G.child),
						(B.subtreeFlags = 0),
						(B.deletions = null),
						(B.memoizedProps = G.memoizedProps),
						(B.memoizedState = G.memoizedState),
						(B.updateQueue = G.updateQueue),
						(B.type = G.type),
						(X = G.dependencies),
						(B.dependencies =
							X === null
								? null
								: {
										lanes: X.lanes,
										firstContext: X.firstContext,
										_debugThenableState: X._debugThenableState,
									}),
						(B.selfBaseDuration = G.selfBaseDuration),
						(B.treeBaseDuration = G.treeBaseDuration)),
				B
			);
		}
		function YG(B, X, G, Z, Y, $) {
			var R = 0,
				z = B;
			if (typeof B === 'function') (ZG(B) && (R = 1), (z = tB(z)));
			else if (typeof B === 'string')
				((R = d()), (R = Bq(B, G, R) ? 26 : B === 'html' || B === 'head' || B === 'body' ? 27 : 5));
			else
				B: switch (B) {
					case i8:
						return ((X = g(31, G, X, Y)), (X.elementType = i8), (X.lanes = $), X);
					case YX:
						return rB(G.children, Y, $, X);
					case S7:
						((R = 8), (Y |= T2), (Y |= f5));
						break;
					case c8:
						return (
							(B = G),
							(Z = Y),
							typeof B.id !== 'string' &&
								console.error(
									'Profiler must specify an "id" of type `string` as a prop. Received the type `%s` instead.',
									typeof B.id,
								),
							(X = g(12, B, X, Z | e)),
							(X.elementType = c8),
							(X.lanes = $),
							(X.stateNode = { effectDuration: 0, passiveEffectDuration: 0 }),
							X
						);
					case o8:
						return ((X = g(13, G, X, Y)), (X.elementType = o8), (X.lanes = $), X);
					case n8:
						return ((X = g(19, G, X, Y)), (X.elementType = n8), (X.lanes = $), X);
					default:
						if (typeof B === 'object' && B !== null)
							switch (B.$$typeof) {
								case M6:
									R = 10;
									break B;
								case a8:
									R = 9;
									break B;
								case E3:
									((R = 11), (z = GG(z)));
									break B;
								case g7:
									R = 14;
									break B;
								case J5:
									((R = 16), (z = null));
									break B;
							}
						if (
							((z = ''),
							B === void 0 || (typeof B === 'object' && B !== null && Object.keys(B).length === 0))
						)
							z +=
								" You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
						(B === null
							? (G = 'null')
							: Q2(B)
								? (G = 'array')
								: B !== void 0 && B.$$typeof === Q6
									? ((G = '<' + (J0(B.type) || 'Unknown') + ' />'),
										(z = ' Did you accidentally export a JSX literal instead of a component?'))
									: (G = typeof B),
							(R = Z ? O5(Z) : null) &&
								(z +=
									`

Check the render method of \`` +
									R +
									'`.'),
							(R = 29),
							(G = Error(
								'Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: ' +
									(G + '.' + z),
							)),
							(z = null));
				}
			return (
				(X = g(R, G, X, Y)),
				(X.elementType = B),
				(X.type = z),
				(X.lanes = $),
				(X._debugOwner = Z),
				X
			);
		}
		function y4(B, X, G) {
			return (
				(X = YG(B.type, B.key, B.props, B._owner, X, G)),
				(X._debugOwner = B._owner),
				(X._debugStack = B._debugStack),
				(X._debugTask = B._debugTask),
				X
			);
		}
		function rB(B, X, G, Z) {
			return ((B = g(7, B, Z, X)), (B.lanes = G), B);
		}
		function $G(B, X, G) {
			return ((B = g(6, B, null, X)), (B.lanes = G), B);
		}
		function W$(B) {
			var X = g(18, null, null, p);
			return ((X.stateNode = B), X);
		}
		function RG(B, X, G) {
			return (
				(X = g(4, B.children !== null ? B.children : [], B.key, X)),
				(X.lanes = G),
				(X.stateNode = {
					containerInfo: B.containerInfo,
					pendingChildren: null,
					implementation: B.implementation,
				}),
				X
			);
		}
		function Z5(B, X) {
			if (typeof B === 'object' && B !== null) {
				var G = EZ.get(B);
				if (G !== void 0) return G;
				return ((X = { value: B, source: X, stack: e2(X) }), EZ.set(B, X), X);
			}
			return { value: B, source: X, stack: e2(X) };
		}
		function V6(B, X) {
			(XB(), (OX[_X++] = f3), (OX[_X++] = n7), (n7 = B), (f3 = X));
		}
		function w$(B, X, G) {
			(XB(), (N5[E5++] = m6), (N5[E5++] = y6), (N5[E5++] = Q1), (Q1 = B));
			var Z = m6;
			B = y6;
			var Y = 32 - g2(Z) - 1;
			((Z &= ~(1 << Y)), (G += 1));
			var $ = 32 - g2(X) + Y;
			if (30 < $) {
				var R = Y - (Y % 5);
				(($ = (Z & ((1 << R) - 1)).toString(32)),
					(Z >>= R),
					(Y -= R),
					(m6 = (1 << (32 - g2(X) + Y)) | (G << Y) | Z),
					(y6 = $ + B));
			} else ((m6 = (1 << $) | (G << Y) | Z), (y6 = B));
		}
		function zG(B) {
			(XB(), B.return !== null && (V6(B, 1), w$(B, 1, 0)));
		}
		function HG(B) {
			for (; B === n7;) ((n7 = OX[--_X]), (OX[_X] = null), (f3 = OX[--_X]), (OX[_X] = null));
			for (; B === Q1;)
				((Q1 = N5[--E5]),
					(N5[E5] = null),
					(y6 = N5[--E5]),
					(N5[E5] = null),
					(m6 = N5[--E5]),
					(N5[E5] = null));
		}
		function K$() {
			return (XB(), Q1 !== null ? { id: m6, overflow: y6 } : null);
		}
		function O$(B, X) {
			(XB(),
				(N5[E5++] = m6),
				(N5[E5++] = y6),
				(N5[E5++] = Q1),
				(m6 = X.id),
				(y6 = X.overflow),
				(Q1 = B));
		}
		function XB() {
			H0 ||
				console.error('Expected to be hydrating. This is a bug in React. Please file an issue.');
		}
		function eB(B, X) {
			if (B.return === null) {
				if (M5 === null)
					M5 = { fiber: B, children: [], serverProps: void 0, serverTail: [], distanceFromLeaf: X };
				else {
					if (M5.fiber !== B)
						throw Error('Saw multiple hydration diff roots in a pass. This is a bug in React.');
					M5.distanceFromLeaf > X && (M5.distanceFromLeaf = X);
				}
				return M5;
			}
			var G = eB(B.return, X + 1).children;
			if (0 < G.length && G[G.length - 1].fiber === B)
				return ((G = G[G.length - 1]), G.distanceFromLeaf > X && (G.distanceFromLeaf = X), G);
			return (
				(X = { fiber: B, children: [], serverProps: void 0, serverTail: [], distanceFromLeaf: X }),
				G.push(X),
				X
			);
		}
		function _$() {
			H0 &&
				console.error(
					'We should not be hydrating here. This is a bug in React. Please file a bug.',
				);
		}
		function f4(B, X) {
			_6 ||
				((B = eB(B, 0)), (B.serverProps = null), X !== null && ((X = iz(X)), B.serverTail.push(X)));
		}
		function GB(B) {
			var X = 1 < arguments.length && arguments[1] !== void 0 ? arguments[1] : !1,
				G = '',
				Z = M5;
			throw (
				Z !== null && ((M5 = null), (G = a9(Z))),
				eX(
					Z5(
						Error(
							'Hydration failed because the server rendered ' +
								(X ? 'text' : 'HTML') +
								` didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:

- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

https://react.dev/link/hydration-mismatch` +
								G,
						),
						B,
					),
				),
				IZ
			);
		}
		function L$(B) {
			var { stateNode: X, type: G, memoizedProps: Z } = B;
			switch (((X[N2] = B), (X[k2] = Z), V8(G, Z), G)) {
				case 'dialog':
					(U0('cancel', X), U0('close', X));
					break;
				case 'iframe':
				case 'object':
				case 'embed':
					U0('load', X);
					break;
				case 'video':
				case 'audio':
					for (G = 0; G < q4.length; G++) U0(q4[G], X);
					break;
				case 'source':
					U0('error', X);
					break;
				case 'img':
				case 'image':
				case 'link':
					(U0('error', X), U0('load', X));
					break;
				case 'details':
					U0('toggle', X);
					break;
				case 'input':
					(BB('input', Z),
						U0('invalid', X),
						NY(X, Z),
						EY(X, Z.value, Z.defaultValue, Z.checked, Z.defaultChecked, Z.type, Z.name, !0));
					break;
				case 'option':
					IY(X, Z);
					break;
				case 'select':
					(BB('select', Z), U0('invalid', X), CY(X, Z));
					break;
				case 'textarea':
					(BB('textarea', Z),
						U0('invalid', X),
						DY(X, Z),
						vY(X, Z.value, Z.defaultValue, Z.children));
			}
			((G = Z.children),
				(typeof G !== 'string' && typeof G !== 'number' && typeof G !== 'bigint') ||
				X.textContent === '' + G ||
				Z.suppressHydrationWarning === !0 ||
				bz(X.textContent, G)
					? (Z.popover != null && (U0('beforetoggle', X), U0('toggle', X)),
						Z.onScroll != null && U0('scroll', X),
						Z.onScrollEnd != null && U0('scrollend', X),
						Z.onClick != null && (X.onclick = E6),
						(X = !0))
					: (X = !1),
				X || GB(B, !0));
		}
		function A$(B) {
			for (E2 = B.return; E2;)
				switch (E2.tag) {
					case 5:
					case 31:
					case 13:
						I5 = !1;
						return;
					case 27:
					case 3:
						I5 = !0;
						return;
					default:
						E2 = E2.return;
				}
		}
		function d1(B) {
			if (B !== E2) return !1;
			if (!H0) return (A$(B), (H0 = !0), !1);
			var X = B.tag,
				G;
			if ((G = X !== 3 && X !== 27)) {
				if ((G = X === 5))
					((G = B.type), (G = !(G !== 'form' && G !== 'button') || S8(B.type, B.memoizedProps)));
				G = !G;
			}
			if (G && f0) {
				for (G = f0; G;) {
					var Z = eB(B, 0),
						Y = iz(G);
					(Z.serverTail.push(Y), (G = Y.type === 'Suspense' ? m8(G) : H5(G.nextSibling)));
				}
				GB(B);
			}
			if ((A$(B), X === 13)) {
				if (((B = B.memoizedState), (B = B !== null ? B.dehydrated : null), !B))
					throw Error(
						'Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.',
					);
				f0 = m8(B);
			} else if (X === 31) {
				if (((B = B.memoizedState), (B = B !== null ? B.dehydrated : null), !B))
					throw Error(
						'Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.',
					);
				f0 = m8(B);
			} else
				X === 27
					? ((X = f0), MB(B.type) ? ((B = KY), (KY = null), (f0 = B)) : (f0 = X))
					: (f0 = E2 ? H5(B.stateNode.nextSibling) : null);
			return !0;
		}
		function B1() {
			((f0 = E2 = null), (_6 = H0 = !1));
		}
		function JG() {
			var B = jB;
			return (B !== null && (h2 === null ? (h2 = B) : h2.push.apply(h2, B), (jB = null)), B);
		}
		function eX(B) {
			jB === null ? (jB = [B]) : jB.push(B);
		}
		function UG() {
			var B = M5;
			if (B !== null) {
				M5 = null;
				for (var X = a9(B); 0 < B.children.length;) B = B.children[0];
				k(B.fiber, function () {
					console.error(
						`A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

%s%s`,
						'https://react.dev/link/hydration-mismatch',
						X,
					);
				});
			}
		}
		function u4() {
			((LX = i7 = null), (AX = !1));
		}
		function ZB(B, X, G) {
			(z0(VZ, X._currentValue, B),
				(X._currentValue = G),
				z0(CZ, X._currentRenderer, B),
				X._currentRenderer !== void 0 &&
					X._currentRenderer !== null &&
					X._currentRenderer !== LJ &&
					console.error(
						'Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported.',
					),
				(X._currentRenderer = LJ));
		}
		function C6(B, X) {
			B._currentValue = VZ.current;
			var G = CZ.current;
			(K0(CZ, X), (B._currentRenderer = G), K0(VZ, X));
		}
		function QG(B, X, G) {
			for (; B !== null;) {
				var Z = B.alternate;
				if (
					((B.childLanes & X) !== X
						? ((B.childLanes |= X), Z !== null && (Z.childLanes |= X))
						: Z !== null && (Z.childLanes & X) !== X && (Z.childLanes |= X),
					B === G)
				)
					break;
				B = B.return;
			}
			B !== G &&
				console.error(
					'Expected to find the propagation root when scheduling context work. This error is likely caused by a bug in React. Please file an issue.',
				);
		}
		function MG(B, X, G, Z) {
			var Y = B.child;
			Y !== null && (Y.return = B);
			for (; Y !== null;) {
				var $ = Y.dependencies;
				if ($ !== null) {
					var R = Y.child;
					$ = $.firstContext;
					B: for (; $ !== null;) {
						var z = $;
						$ = Y;
						for (var H = 0; H < X.length; H++)
							if (z.context === X[H]) {
								(($.lanes |= G),
									(z = $.alternate),
									z !== null && (z.lanes |= G),
									QG($.return, G, B),
									Z || (R = null));
								break B;
							}
						$ = z.next;
					}
				} else if (Y.tag === 18) {
					if (((R = Y.return), R === null))
						throw Error(
							'We just came from a parent so we must have had a parent. This is a bug in React.',
						);
					((R.lanes |= G),
						($ = R.alternate),
						$ !== null && ($.lanes |= G),
						QG(R, G, B),
						(R = null));
				} else R = Y.child;
				if (R !== null) R.return = Y;
				else
					for (R = Y; R !== null;) {
						if (R === B) {
							R = null;
							break;
						}
						if (((Y = R.sibling), Y !== null)) {
							((Y.return = R.return), (R = Y));
							break;
						}
						R = R.return;
					}
				Y = R;
			}
		}
		function s1(B, X, G, Z) {
			B = null;
			for (var Y = X, $ = !1; Y !== null;) {
				if (!$) {
					if ((Y.flags & 524288) !== 0) $ = !0;
					else if ((Y.flags & 262144) !== 0) break;
				}
				if (Y.tag === 10) {
					var R = Y.alternate;
					if (R === null) throw Error('Should have a current fiber. This is a bug in React.');
					if (((R = R.memoizedProps), R !== null)) {
						var z = Y.type;
						m2(Y.pendingProps.value, R.value) || (B !== null ? B.push(z) : (B = [z]));
					}
				} else if (Y === k7.current) {
					if (((R = Y.alternate), R === null))
						throw Error('Should have a current fiber. This is a bug in React.');
					R.memoizedState.memoizedState !== Y.memoizedState.memoizedState &&
						(B !== null ? B.push(_4) : (B = [_4]));
				}
				Y = Y.return;
			}
			(B !== null && MG(X, B, G, Z), (X.flags |= 262144));
		}
		function h4(B) {
			for (B = B.firstContext; B !== null;) {
				if (!m2(B.context._currentValue, B.memoizedValue)) return !0;
				B = B.next;
			}
			return !1;
		}
		function X1(B) {
			((i7 = B), (LX = null), (B = B.dependencies), B !== null && (B.firstContext = null));
		}
		function d0(B) {
			return (
				AX &&
					console.error(
						'Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().',
					),
				j$(i7, B)
			);
		}
		function d4(B, X) {
			return (i7 === null && X1(B), j$(B, X));
		}
		function j$(B, X) {
			var G = X._currentValue;
			if (((X = { context: X, memoizedValue: G, next: null }), LX === null)) {
				if (B === null)
					throw Error(
						'Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().',
					);
				((LX = X),
					(B.dependencies = { lanes: 0, firstContext: X, _debugThenableState: null }),
					(B.flags |= 524288));
			} else LX = LX.next = X;
			return G;
		}
		function qG() {
			return { controller: new NW(), data: new Map(), refCount: 0 };
		}
		function G1(B) {
			(B.controller.signal.aborted &&
				console.warn(
					'A cache instance was retained after it was already freed. This likely indicates a bug in React.',
				),
				B.refCount++);
		}
		function B3(B) {
			(B.refCount--,
				0 > B.refCount &&
					console.warn(
						'A cache instance was released after it was already freed. This likely indicates a bug in React.',
					),
				B.refCount === 0 &&
					EW(IW, function () {
						B.controller.abort();
					}));
		}
		function r5(B, X, G) {
			if ((B & 127) !== 0)
				0 > L6 &&
					((L6 = Y2()),
					(h3 = t7(X)),
					(DZ = X),
					G != null && (TZ = v(G)),
					(M0 & (q2 | w5)) !== L2 && ((i0 = !0), (xB = u3)),
					(B = j3()),
					(X = A3()),
					B !== jX || X !== d3 ? (jX = -1.1) : X !== null && (xB = u3),
					(q1 = B),
					(d3 = X));
			else if (
				(B & 4194048) !== 0 &&
				0 > V5 &&
				((V5 = Y2()), (s3 = t7(X)), (AJ = X), G != null && (jJ = v(G)), 0 > h6)
			) {
				if (((B = j3()), (X = A3()), B !== EB || X !== W1)) EB = -1.1;
				((NB = B), (W1 = X));
			}
		}
		function cQ(B) {
			if (0 > L6) {
				((L6 = Y2()),
					(h3 = B._debugTask != null ? B._debugTask : null),
					(M0 & (q2 | w5)) !== L2 && (xB = u3));
				var X = j3(),
					G = A3();
				(X !== jX || G !== d3 ? (jX = -1.1) : G !== null && (xB = u3), (q1 = X), (d3 = G));
			}
			if (0 > V5 && ((V5 = Y2()), (s3 = B._debugTask != null ? B._debugTask : null), 0 > h6)) {
				if (((B = j3()), (X = A3()), B !== EB || X !== W1)) EB = -1.1;
				((NB = B), (W1 = X));
			}
		}
		function D6() {
			var B = M1;
			return ((M1 = 0), B);
		}
		function s4(B) {
			var X = M1;
			return ((M1 = B), X);
		}
		function X3(B) {
			var X = M1;
			return ((M1 += B), X);
		}
		function l4() {
			s = u = -1.1;
		}
		function Y5() {
			var B = u;
			return ((u = -1.1), B);
		}
		function $5(B) {
			0 <= B && (u = B);
		}
		function e5() {
			var B = c0;
			return ((c0 = -0), B);
		}
		function B6(B) {
			0 <= B && (c0 = B);
		}
		function X6() {
			var B = s0;
			return ((s0 = null), B);
		}
		function G6() {
			var B = i0;
			return ((i0 = !1), B);
		}
		function WG(B) {
			((y2 = Y2()), 0 > B.actualStartTime && (B.actualStartTime = y2));
		}
		function wG(B) {
			if (0 <= y2) {
				var X = Y2() - y2;
				((B.actualDuration += X), (B.selfBaseDuration = X), (y2 = -1));
			}
		}
		function F$(B) {
			if (0 <= y2) {
				var X = Y2() - y2;
				((B.actualDuration += X), (y2 = -1));
			}
		}
		function Z6() {
			if (0 <= y2) {
				var B = Y2(),
					X = B - y2;
				((y2 = -1), (M1 += X), (c0 += X), (s = B));
			}
		}
		function P$(B) {
			(s0 === null && (s0 = []), s0.push(B), u6 === null && (u6 = []), u6.push(B));
		}
		function Y6() {
			((y2 = Y2()), 0 > u && (u = y2));
		}
		function G3(B) {
			for (var X = B.child; X;) ((B.actualDuration += X.actualDuration), (X = X.sibling));
		}
		function aQ(B, X) {
			if (p3 === null) {
				var G = (p3 = []);
				((SZ = 0),
					(w1 = x8()),
					(FX = {
						status: 'pending',
						value: void 0,
						then: function (Z) {
							G.push(Z);
						},
					}));
			}
			return (SZ++, X.then(x$, x$), X);
		}
		function x$() {
			if (--SZ === 0 && (-1 < V5 || (h6 = -1.1), p3 !== null)) {
				FX !== null && (FX.status = 'fulfilled');
				var B = p3;
				((p3 = null), (w1 = 0), (FX = null));
				for (var X = 0; X < B.length; X++) (0, B[X])();
			}
		}
		function oQ(B, X) {
			var G = [],
				Z = {
					status: 'pending',
					value: null,
					reason: null,
					then: function (Y) {
						G.push(Y);
					},
				};
			return (
				B.then(
					function () {
						((Z.status = 'fulfilled'), (Z.value = X));
						for (var Y = 0; Y < G.length; Y++) (0, G[Y])(X);
					},
					function (Y) {
						((Z.status = 'rejected'), (Z.reason = Y));
						for (Y = 0; Y < G.length; Y++) (0, G[Y])(void 0);
					},
				),
				Z
			);
		}
		function KG() {
			var B = K1.current;
			return B !== null ? B : S0.pooledCache;
		}
		function p4(B, X) {
			X === null ? z0(K1, K1.current, B) : z0(K1, X.pool, B);
		}
		function N$() {
			var B = KG();
			return B === null ? null : { parent: Z2._currentValue, pool: B };
		}
		function E$() {
			return { didWarnAboutUncachedPromise: !1, thenables: [] };
		}
		function I$(B) {
			return ((B = B.status), B === 'fulfilled' || B === 'rejected');
		}
		function V$(B, X, G) {
			A.actQueue !== null && (A.didUsePromise = !0);
			var Z = B.thenables;
			if (
				((G = Z[G]),
				G === void 0
					? Z.push(X)
					: G !== X &&
						(B.didWarnAboutUncachedPromise ||
							((B.didWarnAboutUncachedPromise = !0),
							console.error(
								'A component was suspended by an uncached promise. Creating promises inside a Client Component or hook is not yet supported, except via a Suspense-compatible library or framework.',
							)),
						X.then(E6, E6),
						(X = G)),
				X._debugInfo === void 0)
			) {
				((B = performance.now()), (Z = X.displayName));
				var Y = { name: typeof Z === 'string' ? Z : 'Promise', start: B, end: B, value: X };
				((X._debugInfo = [{ awaited: Y }]),
					X.status !== 'fulfilled' &&
						X.status !== 'rejected' &&
						((B = function () {
							Y.end = performance.now();
						}),
						X.then(B, B)));
			}
			switch (X.status) {
				case 'fulfilled':
					return X.value;
				case 'rejected':
					throw ((B = X.reason), D$(B), B);
				default:
					if (typeof X.status === 'string') X.then(E6, E6);
					else {
						if (((B = S0), B !== null && 100 < B.shellSuspendCounter))
							throw Error(
								"An unknown Component is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.",
							);
						((B = X),
							(B.status = 'pending'),
							B.then(
								function ($) {
									if (X.status === 'pending') {
										var R = X;
										((R.status = 'fulfilled'), (R.value = $));
									}
								},
								function ($) {
									if (X.status === 'pending') {
										var R = X;
										((R.status = 'rejected'), (R.reason = $));
									}
								},
							));
					}
					switch (X.status) {
						case 'fulfilled':
							return X.value;
						case 'rejected':
							throw ((B = X.reason), D$(B), B);
					}
					throw ((_1 = X), (r3 = !0), PX);
			}
		}
		function YB(B) {
			try {
				return TW(B);
			} catch (X) {
				if (X !== null && typeof X === 'object' && typeof X.then === 'function')
					throw ((_1 = X), (r3 = !0), PX);
				throw X;
			}
		}
		function C$() {
			if (_1 === null)
				throw Error('Expected a suspended thenable. This is a bug in React. Please file an issue.');
			var B = _1;
			return ((_1 = null), (r3 = !1), B);
		}
		function D$(B) {
			if (B === PX || B === $9)
				throw Error(
					"Hooks are not supported inside an async component. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.",
				);
		}
		function F2(B) {
			var X = B0;
			return (B != null && (B0 = X === null ? B : X.concat(B)), X);
		}
		function OG() {
			var B = B0;
			if (B != null) {
				for (var X = B.length - 1; 0 <= X; X--)
					if (B[X].name != null) {
						var G = B[X].debugTask;
						if (G != null) return G;
					}
			}
			return null;
		}
		function c4(B, X, G) {
			for (var Z = Object.keys(B.props), Y = 0; Y < Z.length; Y++) {
				var $ = Z[Y];
				if ($ !== 'children' && $ !== 'key') {
					(X === null && ((X = y4(B, G.mode, 0)), (X._debugInfo = B0), (X.return = G)),
						k(
							X,
							function (R) {
								console.error(
									'Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.',
									R,
								);
							},
							$,
						));
					break;
				}
			}
		}
		function a4(B) {
			var X = e3;
			return ((e3 += 1), xX === null && (xX = E$()), V$(xX, B, X));
		}
		function Z3(B, X) {
			((X = X.props.ref), (B.ref = X !== void 0 ? X : null));
		}
		function T$(B, X) {
			if (X.$$typeof === Uq)
				throw Error(`A React Element from an older version of React was rendered. This is not supported. It can happen if:
- Multiple copies of the "react" package is used.
- A library pre-bundled an old copy of "react" or "react/jsx-runtime".
- A compiler tries to "inline" JSX instead of using the runtime.`);
			throw (
				(B = Object.prototype.toString.call(X)),
				Error(
					'Objects are not valid as a React child (found: ' +
						(B === '[object Object]' ? 'object with keys {' + Object.keys(X).join(', ') + '}' : B) +
						'). If you meant to render a collection of children, use an array instead.',
				)
			);
		}
		function o4(B, X) {
			var G = OG();
			G !== null ? G.run(T$.bind(null, B, X)) : T$(B, X);
		}
		function v$(B, X) {
			var G = v(B) || 'Component';
			hJ[G] ||
				((hJ[G] = !0),
				(X = X.displayName || X.name || 'Component'),
				B.tag === 3
					? console.error(
							`Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.
  root.render(%s)`,
							X,
							X,
							X,
						)
					: console.error(
							`Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.
  <%s>{%s}</%s>`,
							X,
							X,
							G,
							X,
							G,
						));
		}
		function n4(B, X) {
			var G = OG();
			G !== null ? G.run(v$.bind(null, B, X)) : v$(B, X);
		}
		function S$(B, X) {
			var G = v(B) || 'Component';
			dJ[G] ||
				((dJ[G] = !0),
				(X = String(X)),
				B.tag === 3
					? console.error(
							`Symbols are not valid as a React child.
  root.render(%s)`,
							X,
						)
					: console.error(
							`Symbols are not valid as a React child.
  <%s>%s</%s>`,
							G,
							X,
							G,
						));
		}
		function i4(B, X) {
			var G = OG();
			G !== null ? G.run(S$.bind(null, B, X)) : S$(B, X);
		}
		function g$(B) {
			function X(Q, q) {
				if (B) {
					var W = Q.deletions;
					W === null ? ((Q.deletions = [q]), (Q.flags |= 16)) : W.push(q);
				}
			}
			function G(Q, q) {
				if (!B) return null;
				for (; q !== null;) (X(Q, q), (q = q.sibling));
				return null;
			}
			function Z(Q) {
				for (var q = new Map(); Q !== null;)
					(Q.key !== null ? q.set(Q.key, Q) : q.set(Q.index, Q), (Q = Q.sibling));
				return q;
			}
			function Y(Q, q) {
				return ((Q = I6(Q, q)), (Q.index = 0), (Q.sibling = null), Q);
			}
			function $(Q, q, W) {
				if (((Q.index = W), !B)) return ((Q.flags |= 1048576), q);
				if (((W = Q.alternate), W !== null))
					return ((W = W.index), W < q ? ((Q.flags |= 67108866), q) : W);
				return ((Q.flags |= 67108866), q);
			}
			function R(Q) {
				return (B && Q.alternate === null && (Q.flags |= 67108866), Q);
			}
			function z(Q, q, W, F) {
				if (q === null || q.tag !== 6)
					return (
						(q = $G(W, Q.mode, F)),
						(q.return = Q),
						(q._debugOwner = Q),
						(q._debugTask = Q._debugTask),
						(q._debugInfo = B0),
						q
					);
				return ((q = Y(q, W)), (q.return = Q), (q._debugInfo = B0), q);
			}
			function H(Q, q, W, F) {
				var D = W.type;
				if (D === YX) return ((q = w(Q, q, W.props.children, F, W.key)), c4(W, q, Q), q);
				if (
					q !== null &&
					(q.elementType === D ||
						U$(q, W) ||
						(typeof D === 'object' && D !== null && D.$$typeof === J5 && YB(D) === q.type))
				)
					return (
						(q = Y(q, W.props)),
						Z3(q, W),
						(q.return = Q),
						(q._debugOwner = W._owner),
						(q._debugInfo = B0),
						q
					);
				return ((q = y4(W, Q.mode, F)), Z3(q, W), (q.return = Q), (q._debugInfo = B0), q);
			}
			function J(Q, q, W, F) {
				if (
					q === null ||
					q.tag !== 4 ||
					q.stateNode.containerInfo !== W.containerInfo ||
					q.stateNode.implementation !== W.implementation
				)
					return ((q = RG(W, Q.mode, F)), (q.return = Q), (q._debugInfo = B0), q);
				return ((q = Y(q, W.children || [])), (q.return = Q), (q._debugInfo = B0), q);
			}
			function w(Q, q, W, F, D) {
				if (q === null || q.tag !== 7)
					return (
						(q = rB(W, Q.mode, F, D)),
						(q.return = Q),
						(q._debugOwner = Q),
						(q._debugTask = Q._debugTask),
						(q._debugInfo = B0),
						q
					);
				return ((q = Y(q, W)), (q.return = Q), (q._debugInfo = B0), q);
			}
			function K(Q, q, W) {
				if ((typeof q === 'string' && q !== '') || typeof q === 'number' || typeof q === 'bigint')
					return (
						(q = $G('' + q, Q.mode, W)),
						(q.return = Q),
						(q._debugOwner = Q),
						(q._debugTask = Q._debugTask),
						(q._debugInfo = B0),
						q
					);
				if (typeof q === 'object' && q !== null) {
					switch (q.$$typeof) {
						case Q6:
							return (
								(W = y4(q, Q.mode, W)),
								Z3(W, q),
								(W.return = Q),
								(Q = F2(q._debugInfo)),
								(W._debugInfo = B0),
								(B0 = Q),
								W
							);
						case ZX:
							return ((q = RG(q, Q.mode, W)), (q.return = Q), (q._debugInfo = B0), q);
						case J5:
							var F = F2(q._debugInfo);
							return ((q = YB(q)), (Q = K(Q, q, W)), (B0 = F), Q);
					}
					if (Q2(q) || U2(q))
						return (
							(W = rB(q, Q.mode, W, null)),
							(W.return = Q),
							(W._debugOwner = Q),
							(W._debugTask = Q._debugTask),
							(Q = F2(q._debugInfo)),
							(W._debugInfo = B0),
							(B0 = Q),
							W
						);
					if (typeof q.then === 'function')
						return ((F = F2(q._debugInfo)), (Q = K(Q, a4(q), W)), (B0 = F), Q);
					if (q.$$typeof === M6) return K(Q, d4(Q, q), W);
					o4(Q, q);
				}
				return (typeof q === 'function' && n4(Q, q), typeof q === 'symbol' && i4(Q, q), null);
			}
			function M(Q, q, W, F) {
				var D = q !== null ? q.key : null;
				if ((typeof W === 'string' && W !== '') || typeof W === 'number' || typeof W === 'bigint')
					return D !== null ? null : z(Q, q, '' + W, F);
				if (typeof W === 'object' && W !== null) {
					switch (W.$$typeof) {
						case Q6:
							return W.key === D
								? ((D = F2(W._debugInfo)), (Q = H(Q, q, W, F)), (B0 = D), Q)
								: null;
						case ZX:
							return W.key === D ? J(Q, q, W, F) : null;
						case J5:
							return ((D = F2(W._debugInfo)), (W = YB(W)), (Q = M(Q, q, W, F)), (B0 = D), Q);
					}
					if (Q2(W) || U2(W)) {
						if (D !== null) return null;
						return ((D = F2(W._debugInfo)), (Q = w(Q, q, W, F, null)), (B0 = D), Q);
					}
					if (typeof W.then === 'function')
						return ((D = F2(W._debugInfo)), (Q = M(Q, q, a4(W), F)), (B0 = D), Q);
					if (W.$$typeof === M6) return M(Q, q, d4(Q, W), F);
					o4(Q, W);
				}
				return (typeof W === 'function' && n4(Q, W), typeof W === 'symbol' && i4(Q, W), null);
			}
			function _(Q, q, W, F, D) {
				if ((typeof F === 'string' && F !== '') || typeof F === 'number' || typeof F === 'bigint')
					return ((Q = Q.get(W) || null), z(q, Q, '' + F, D));
				if (typeof F === 'object' && F !== null) {
					switch (F.$$typeof) {
						case Q6:
							return (
								(W = Q.get(F.key === null ? W : F.key) || null),
								(Q = F2(F._debugInfo)),
								(q = H(q, W, F, D)),
								(B0 = Q),
								q
							);
						case ZX:
							return ((Q = Q.get(F.key === null ? W : F.key) || null), J(q, Q, F, D));
						case J5:
							var a = F2(F._debugInfo);
							return ((F = YB(F)), (q = _(Q, q, W, F, D)), (B0 = a), q);
					}
					if (Q2(F) || U2(F))
						return (
							(W = Q.get(W) || null),
							(Q = F2(F._debugInfo)),
							(q = w(q, W, F, D, null)),
							(B0 = Q),
							q
						);
					if (typeof F.then === 'function')
						return ((a = F2(F._debugInfo)), (q = _(Q, q, W, a4(F), D)), (B0 = a), q);
					if (F.$$typeof === M6) return _(Q, q, W, d4(q, F), D);
					o4(q, F);
				}
				return (typeof F === 'function' && n4(q, F), typeof F === 'symbol' && i4(q, F), null);
			}
			function V(Q, q, W, F) {
				if (typeof W !== 'object' || W === null) return F;
				switch (W.$$typeof) {
					case Q6:
					case ZX:
						I(Q, q, W);
						var D = W.key;
						if (typeof D !== 'string') break;
						if (F === null) {
							((F = new Set()), F.add(D));
							break;
						}
						if (!F.has(D)) {
							F.add(D);
							break;
						}
						k(q, function () {
							console.error(
								'Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.',
								D,
							);
						});
						break;
					case J5:
						((W = YB(W)), V(Q, q, W, F));
				}
				return F;
			}
			function S(Q, q, W, F) {
				for (
					var D = null, a = null, y = null, m = q, t = (q = 0), u0 = null;
					m !== null && t < W.length;
					t++
				) {
					m.index > t ? ((u0 = m), (m = null)) : (u0 = m.sibling);
					var B2 = M(Q, m, W[t], F);
					if (B2 === null) {
						m === null && (m = u0);
						break;
					}
					((D = V(Q, B2, W[t], D)),
						B && m && B2.alternate === null && X(Q, m),
						(q = $(B2, q, t)),
						y === null ? (a = B2) : (y.sibling = B2),
						(y = B2),
						(m = u0));
				}
				if (t === W.length) return (G(Q, m), H0 && V6(Q, t), a);
				if (m === null) {
					for (; t < W.length; t++)
						((m = K(Q, W[t], F)),
							m !== null &&
								((D = V(Q, m, W[t], D)),
								(q = $(m, q, t)),
								y === null ? (a = m) : (y.sibling = m),
								(y = m)));
					return (H0 && V6(Q, t), a);
				}
				for (m = Z(m); t < W.length; t++)
					((u0 = _(m, Q, t, W[t], F)),
						u0 !== null &&
							((D = V(Q, u0, W[t], D)),
							B && u0.alternate !== null && m.delete(u0.key === null ? t : u0.key),
							(q = $(u0, q, t)),
							y === null ? (a = u0) : (y.sibling = u0),
							(y = u0)));
				return (
					B &&
						m.forEach(function (i6) {
							return X(Q, i6);
						}),
					H0 && V6(Q, t),
					a
				);
			}
			function b0(Q, q, W, F) {
				if (W == null) throw Error('An iterable object provided no iterator.');
				for (
					var D = null, a = null, y = q, m = (q = 0), t = null, u0 = null, B2 = W.next();
					y !== null && !B2.done;
					m++, B2 = W.next()
				) {
					y.index > m ? ((t = y), (y = null)) : (t = y.sibling);
					var i6 = M(Q, y, B2.value, F);
					if (i6 === null) {
						y === null && (y = t);
						break;
					}
					((u0 = V(Q, i6, B2.value, u0)),
						B && y && i6.alternate === null && X(Q, y),
						(q = $(i6, q, m)),
						a === null ? (D = i6) : (a.sibling = i6),
						(a = i6),
						(y = t));
				}
				if (B2.done) return (G(Q, y), H0 && V6(Q, m), D);
				if (y === null) {
					for (; !B2.done; m++, B2 = W.next())
						((y = K(Q, B2.value, F)),
							y !== null &&
								((u0 = V(Q, y, B2.value, u0)),
								(q = $(y, q, m)),
								a === null ? (D = y) : (a.sibling = y),
								(a = y)));
					return (H0 && V6(Q, m), D);
				}
				for (y = Z(y); !B2.done; m++, B2 = W.next())
					((t = _(y, Q, m, B2.value, F)),
						t !== null &&
							((u0 = V(Q, t, B2.value, u0)),
							B && t.alternate !== null && y.delete(t.key === null ? m : t.key),
							(q = $(t, q, m)),
							a === null ? (D = t) : (a.sibling = t),
							(a = t)));
				return (
					B &&
						y.forEach(function (Xw) {
							return X(Q, Xw);
						}),
					H0 && V6(Q, m),
					D
				);
			}
			function Q0(Q, q, W, F) {
				if (
					(typeof W === 'object' &&
						W !== null &&
						W.type === YX &&
						W.key === null &&
						(c4(W, null, Q), (W = W.props.children)),
					typeof W === 'object' && W !== null)
				) {
					switch (W.$$typeof) {
						case Q6:
							var D = F2(W._debugInfo);
							B: {
								for (var a = W.key; q !== null;) {
									if (q.key === a) {
										if (((a = W.type), a === YX)) {
											if (q.tag === 7) {
												(G(Q, q.sibling),
													(F = Y(q, W.props.children)),
													(F.return = Q),
													(F._debugOwner = W._owner),
													(F._debugInfo = B0),
													c4(W, F, Q),
													(Q = F));
												break B;
											}
										} else if (
											q.elementType === a ||
											U$(q, W) ||
											(typeof a === 'object' && a !== null && a.$$typeof === J5 && YB(a) === q.type)
										) {
											(G(Q, q.sibling),
												(F = Y(q, W.props)),
												Z3(F, W),
												(F.return = Q),
												(F._debugOwner = W._owner),
												(F._debugInfo = B0),
												(Q = F));
											break B;
										}
										G(Q, q);
										break;
									} else X(Q, q);
									q = q.sibling;
								}
								W.type === YX
									? ((F = rB(W.props.children, Q.mode, F, W.key)),
										(F.return = Q),
										(F._debugOwner = Q),
										(F._debugTask = Q._debugTask),
										(F._debugInfo = B0),
										c4(W, F, Q),
										(Q = F))
									: ((F = y4(W, Q.mode, F)),
										Z3(F, W),
										(F.return = Q),
										(F._debugInfo = B0),
										(Q = F));
							}
							return ((Q = R(Q)), (B0 = D), Q);
						case ZX:
							B: {
								D = W;
								for (W = D.key; q !== null;) {
									if (q.key === W)
										if (
											q.tag === 4 &&
											q.stateNode.containerInfo === D.containerInfo &&
											q.stateNode.implementation === D.implementation
										) {
											(G(Q, q.sibling), (F = Y(q, D.children || [])), (F.return = Q), (Q = F));
											break B;
										} else {
											G(Q, q);
											break;
										}
									else X(Q, q);
									q = q.sibling;
								}
								((F = RG(D, Q.mode, F)), (F.return = Q), (Q = F));
							}
							return R(Q);
						case J5:
							return ((D = F2(W._debugInfo)), (W = YB(W)), (Q = Q0(Q, q, W, F)), (B0 = D), Q);
					}
					if (Q2(W)) return ((D = F2(W._debugInfo)), (Q = S(Q, q, W, F)), (B0 = D), Q);
					if (U2(W)) {
						if (((D = F2(W._debugInfo)), (a = U2(W)), typeof a !== 'function'))
							throw Error(
								'An object is not an iterable. This error is likely caused by a bug in React. Please file an issue.',
							);
						var y = a.call(W);
						if (y === W) {
							if (
								Q.tag !== 0 ||
								Object.prototype.toString.call(Q.type) !== '[object GeneratorFunction]' ||
								Object.prototype.toString.call(y) !== '[object Generator]'
							)
								(fJ ||
									console.error(
										'Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items.',
									),
									(fJ = !0));
						} else
							W.entries !== a ||
								mZ ||
								(console.error(
									'Using Maps as children is not supported. Use an array of keyed ReactElements instead.',
								),
								(mZ = !0));
						return ((Q = b0(Q, q, y, F)), (B0 = D), Q);
					}
					if (typeof W.then === 'function')
						return ((D = F2(W._debugInfo)), (Q = Q0(Q, q, a4(W), F)), (B0 = D), Q);
					if (W.$$typeof === M6) return Q0(Q, q, d4(Q, W), F);
					o4(Q, W);
				}
				if ((typeof W === 'string' && W !== '') || typeof W === 'number' || typeof W === 'bigint')
					return (
						(D = '' + W),
						q !== null && q.tag === 6
							? (G(Q, q.sibling), (F = Y(q, D)), (F.return = Q), (Q = F))
							: (G(Q, q),
								(F = $G(D, Q.mode, F)),
								(F.return = Q),
								(F._debugOwner = Q),
								(F._debugTask = Q._debugTask),
								(F._debugInfo = B0),
								(Q = F)),
						R(Q)
					);
				return (typeof W === 'function' && n4(Q, W), typeof W === 'symbol' && i4(Q, W), G(Q, q));
			}
			return function (Q, q, W, F) {
				var D = B0;
				B0 = null;
				try {
					e3 = 0;
					var a = Q0(Q, q, W, F);
					return ((xX = null), a);
				} catch (u0) {
					if (u0 === PX || u0 === $9) throw u0;
					var y = g(29, u0, null, Q.mode);
					((y.lanes = F), (y.return = Q));
					var m = (y._debugInfo = B0);
					if (((y._debugOwner = Q._debugOwner), (y._debugTask = Q._debugTask), m != null)) {
						for (var t = m.length - 1; 0 <= t; t--)
							if (typeof m[t].stack === 'string') {
								((y._debugOwner = m[t]), (y._debugTask = m[t].debugTask));
								break;
							}
					}
					return y;
				} finally {
					B0 = D;
				}
			};
		}
		function k$(B, X) {
			var G = Q2(B);
			return (
				(B = !G && typeof U2(B) === 'function'),
				G || B
					? ((G = G ? 'array' : 'iterable'),
						console.error(
							'A nested %s was passed to row #%s in <SuspenseList />. Wrap it in an additional SuspenseList to configure its revealOrder: <SuspenseList revealOrder=...> ... <SuspenseList revealOrder=...>{%s}</SuspenseList> ... </SuspenseList>',
							G,
							X,
							G,
						),
						!1)
					: !0
			);
		}
		function _G(B) {
			B.updateQueue = {
				baseState: B.memoizedState,
				firstBaseUpdate: null,
				lastBaseUpdate: null,
				shared: { pending: null, lanes: 0, hiddenCallbacks: null },
				callbacks: null,
			};
		}
		function LG(B, X) {
			((B = B.updateQueue),
				X.updateQueue === B &&
					(X.updateQueue = {
						baseState: B.baseState,
						firstBaseUpdate: B.firstBaseUpdate,
						lastBaseUpdate: B.lastBaseUpdate,
						shared: B.shared,
						callbacks: null,
					}));
		}
		function $B(B) {
			return { lane: B, tag: lJ, payload: null, callback: null, next: null };
		}
		function RB(B, X, G) {
			var Z = B.updateQueue;
			if (Z === null) return null;
			if (((Z = Z.shared), fZ === Z && !aJ)) {
				var Y = v(B);
				(console.error(
					`An update (setState, replaceState, or forceUpdate) was scheduled from inside an update function. Update functions should be pure, with zero side-effects. Consider using componentDidUpdate or a callback.

Please update the following component: %s`,
					Y,
				),
					(aJ = !0));
			}
			if ((M0 & q2) !== L2)
				return (
					(Y = Z.pending),
					Y === null ? (X.next = X) : ((X.next = Y.next), (Y.next = X)),
					(Z.pending = X),
					(X = m4(B)),
					J$(B, null, G),
					X
				);
			return (b4(B, Z, X, G), m4(B));
		}
		function Y3(B, X, G) {
			if (((X = X.updateQueue), X !== null && ((X = X.shared), (G & 4194048) !== 0))) {
				var Z = X.lanes;
				((Z &= B.pendingLanes), (G |= Z), (X.lanes = G), pB(B, G));
			}
		}
		function t4(B, X) {
			var { updateQueue: G, alternate: Z } = B;
			if (Z !== null && ((Z = Z.updateQueue), G === Z)) {
				var Y = null,
					$ = null;
				if (((G = G.firstBaseUpdate), G !== null)) {
					do {
						var R = { lane: G.lane, tag: G.tag, payload: G.payload, callback: null, next: null };
						($ === null ? (Y = $ = R) : ($ = $.next = R), (G = G.next));
					} while (G !== null);
					$ === null ? (Y = $ = X) : ($ = $.next = X);
				} else Y = $ = X;
				((G = {
					baseState: Z.baseState,
					firstBaseUpdate: Y,
					lastBaseUpdate: $,
					shared: Z.shared,
					callbacks: Z.callbacks,
				}),
					(B.updateQueue = G));
				return;
			}
			((B = G.lastBaseUpdate),
				B === null ? (G.firstBaseUpdate = X) : (B.next = X),
				(G.lastBaseUpdate = X));
		}
		function $3() {
			if (uZ) {
				var B = FX;
				if (B !== null) throw B;
			}
		}
		function R3(B, X, G, Z) {
			uZ = !1;
			var Y = B.updateQueue;
			((IB = !1), (fZ = Y.shared));
			var { firstBaseUpdate: $, lastBaseUpdate: R } = Y,
				z = Y.shared.pending;
			if (z !== null) {
				Y.shared.pending = null;
				var H = z,
					J = H.next;
				((H.next = null), R === null ? ($ = J) : (R.next = J), (R = H));
				var w = B.alternate;
				w !== null &&
					((w = w.updateQueue),
					(z = w.lastBaseUpdate),
					z !== R && (z === null ? (w.firstBaseUpdate = J) : (z.next = J), (w.lastBaseUpdate = H)));
			}
			if ($ !== null) {
				var K = Y.baseState;
				((R = 0), (w = J = H = null), (z = $));
				do {
					var M = z.lane & -536870913,
						_ = M !== z.lane;
					if (_ ? (X0 & M) === M : (Z & M) === M) {
						(M !== 0 && M === w1 && (uZ = !0),
							w !== null &&
								(w = w.next =
									{ lane: 0, tag: z.tag, payload: z.payload, callback: null, next: null }));
						B: {
							M = B;
							var V = z,
								S = X,
								b0 = G;
							switch (V.tag) {
								case pJ:
									if (((V = V.payload), typeof V === 'function')) {
										AX = !0;
										var Q0 = V.call(b0, K, S);
										if (M.mode & T2) {
											g0(!0);
											try {
												V.call(b0, K, S);
											} finally {
												g0(!1);
											}
										}
										((AX = !1), (K = Q0));
										break B;
									}
									K = V;
									break B;
								case yZ:
									M.flags = (M.flags & -65537) | 128;
								case lJ:
									if (((Q0 = V.payload), typeof Q0 === 'function')) {
										if (((AX = !0), (V = Q0.call(b0, K, S)), M.mode & T2)) {
											g0(!0);
											try {
												Q0.call(b0, K, S);
											} finally {
												g0(!1);
											}
										}
										AX = !1;
									} else V = Q0;
									if (V === null || V === void 0) break B;
									K = Y0({}, K, V);
									break B;
								case cJ:
									IB = !0;
							}
						}
						((M = z.callback),
							M !== null &&
								((B.flags |= 64),
								_ && (B.flags |= 8192),
								(_ = Y.callbacks),
								_ === null ? (Y.callbacks = [M]) : _.push(M)));
					} else
						((_ = { lane: M, tag: z.tag, payload: z.payload, callback: z.callback, next: null }),
							w === null ? ((J = w = _), (H = K)) : (w = w.next = _),
							(R |= M));
					if (((z = z.next), z === null))
						if (((z = Y.shared.pending), z === null)) break;
						else
							((_ = z),
								(z = _.next),
								(_.next = null),
								(Y.lastBaseUpdate = _),
								(Y.shared.pending = null));
				} while (1);
				(w === null && (H = K),
					(Y.baseState = H),
					(Y.firstBaseUpdate = J),
					(Y.lastBaseUpdate = w),
					$ === null && (Y.shared.lanes = 0),
					(DB |= R),
					(B.lanes = R),
					(B.memoizedState = K));
			}
			fZ = null;
		}
		function b$(B, X) {
			if (typeof B !== 'function')
				throw Error(
					'Invalid argument passed as callback. Expected a function. Instead received: ' + B,
				);
			B.call(X);
		}
		function nQ(B, X) {
			var G = B.shared.hiddenCallbacks;
			if (G !== null) for (B.shared.hiddenCallbacks = null, B = 0; B < G.length; B++) b$(G[B], X);
		}
		function m$(B, X) {
			var G = B.callbacks;
			if (G !== null) for (B.callbacks = null, B = 0; B < G.length; B++) b$(G[B], X);
		}
		function y$(B, X) {
			var G = F6;
			(z0(z9, G, B), z0(NX, X, B), (F6 = G | X.baseLanes));
		}
		function AG(B) {
			(z0(z9, F6, B), z0(NX, NX.current, B));
		}
		function jG(B) {
			((F6 = z9.current), K0(NX, B), K0(z9, B));
		}
		function zB(B) {
			var X = B.alternate;
			(z0(e0, e0.current & EX, B),
				z0(q5, B, B),
				C5 === null &&
					(X === null || NX.current !== null ? (C5 = B) : X.memoizedState !== null && (C5 = B)));
		}
		function FG(B) {
			(z0(e0, e0.current, B), z0(q5, B, B), C5 === null && (C5 = B));
		}
		function f$(B) {
			B.tag === 22 ? (z0(e0, e0.current, B), z0(q5, B, B), C5 === null && (C5 = B)) : HB(B);
		}
		function HB(B) {
			(z0(e0, e0.current, B), z0(q5, q5.current, B));
		}
		function R5(B) {
			(K0(q5, B), C5 === B && (C5 = null), K0(e0, B));
		}
		function r4(B) {
			for (var X = B; X !== null;) {
				if (X.tag === 13) {
					var G = X.memoizedState;
					if (G !== null && ((G = G.dehydrated), G === null || k8(G) || b8(G))) return X;
				} else if (
					X.tag === 19 &&
					(X.memoizedProps.revealOrder === 'forwards' ||
						X.memoizedProps.revealOrder === 'backwards' ||
						X.memoizedProps.revealOrder === 'unstable_legacy-backwards' ||
						X.memoizedProps.revealOrder === 'together')
				) {
					if ((X.flags & 128) !== 0) return X;
				} else if (X.child !== null) {
					((X.child.return = X), (X = X.child));
					continue;
				}
				if (X === B) break;
				for (; X.sibling === null;) {
					if (X.return === null || X.return === B) return null;
					X = X.return;
				}
				((X.sibling.return = X.return), (X = X.sibling));
			}
			return null;
		}
		function Z0() {
			var B = L;
			T5 === null ? (T5 = [B]) : T5.push(B);
		}
		function x() {
			var B = L;
			if (T5 !== null && (p6++, T5[p6] !== B)) {
				var X = v(c);
				if (!oJ.has(X) && (oJ.add(X), T5 !== null)) {
					for (var G = '', Z = 0; Z <= p6; Z++) {
						var Y = T5[Z],
							$ = Z === p6 ? B : Y;
						for (Y = Z + 1 + '. ' + Y; 30 > Y.length;) Y += ' ';
						((Y +=
							$ +
							`
`),
							(G += Y));
					}
					console.error(
						`React has detected a change in the order of Hooks called by %s. This will lead to bugs and errors if not fixed. For more information, read the Rules of Hooks: https://react.dev/link/rules-of-hooks

   Previous render            Next render
   ------------------------------------------------------
%s   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
`,
						X,
						G,
					);
				}
			}
		}
		function l1(B) {
			B === void 0 ||
				B === null ||
				Q2(B) ||
				console.error(
					'%s received a final argument that is not an array (instead, received `%s`). When specified, the final argument must be an array.',
					L,
					typeof B,
				);
		}
		function e4() {
			var B = v(c);
			iJ.has(B) ||
				(iJ.add(B),
				console.error(
					'ReactDOM.useFormState has been renamed to React.useActionState. Please update %s to use React.useActionState.',
					B,
				));
		}
		function t0() {
			throw Error(`Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`);
		}
		function PG(B, X) {
			if (G4) return !1;
			if (X === null)
				return (
					console.error(
						'%s received a final argument during this render, but not during the previous render. Even though the final argument is optional, its type cannot change between renders.',
						L,
					),
					!1
				);
			B.length !== X.length &&
				console.error(
					`The final argument passed to %s changed size between renders. The order and size of this array must remain constant.

Previous: %s
Incoming: %s`,
					L,
					'[' + X.join(', ') + ']',
					'[' + B.join(', ') + ']',
				);
			for (var G = 0; G < X.length && G < B.length; G++) if (!m2(B[G], X[G])) return !1;
			return !0;
		}
		function xG(B, X, G, Z, Y, $) {
			if (
				((s6 = $),
				(c = X),
				(T5 = B !== null ? B._debugHookTypes : null),
				(p6 = -1),
				(G4 = B !== null && B.type !== X.type),
				Object.prototype.toString.call(G) === '[object AsyncFunction]' ||
					Object.prototype.toString.call(G) === '[object AsyncGeneratorFunction]')
			)
				(($ = v(c)),
					hZ.has($) ||
						(hZ.add($),
						console.error(
							"%s is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.",
							$ === null ? 'An unknown Component' : '<' + $ + '>',
						)));
			((X.memoizedState = null),
				(X.updateQueue = null),
				(X.lanes = 0),
				(A.H = B !== null && B.memoizedState !== null ? sZ : T5 !== null ? tJ : dZ),
				(A1 = $ = (X.mode & T2) !== p));
			var R = gZ(G, Z, Y);
			if (((A1 = !1), VX && (R = NG(X, G, Z, Y)), $)) {
				g0(!0);
				try {
					R = NG(X, G, Z, Y);
				} finally {
					g0(!1);
				}
			}
			return (u$(B, X), R);
		}
		function u$(B, X) {
			((X._debugHookTypes = T5),
				X.dependencies === null
					? l6 !== null &&
						(X.dependencies = { lanes: 0, firstContext: null, _debugThenableState: l6 })
					: (X.dependencies._debugThenableState = l6),
				(A.H = Z4));
			var G = v0 !== null && v0.next !== null;
			if (
				((s6 = 0),
				(T5 = L = $2 = v0 = c = null),
				(p6 = -1),
				B !== null &&
					(B.flags & 65011712) !== (X.flags & 65011712) &&
					console.error(
						'Internal React error: Expected static flag was missing. Please notify the React team.',
					),
				(J9 = !1),
				(X4 = 0),
				(l6 = null),
				G)
			)
				throw Error(
					'Rendered fewer hooks than expected. This may be caused by an accidental early return statement.',
				);
			(B === null || R2 || ((B = B.dependencies), B !== null && h4(B) && (R2 = !0)),
				r3 ? ((r3 = !1), (B = !0)) : (B = !1),
				B &&
					((X = v(X) || 'Unknown'),
					nJ.has(X) ||
						hZ.has(X) ||
						(nJ.add(X),
						console.error(
							'`use` was called from inside a try/catch block. This is not allowed and can lead to unexpected behavior. To handle errors triggered by `use`, wrap your component in a error boundary.',
						))));
		}
		function NG(B, X, G, Z) {
			c = B;
			var Y = 0;
			do {
				if ((VX && (l6 = null), (X4 = 0), (VX = !1), Y >= SW))
					throw Error(
						'Too many re-renders. React limits the number of renders to prevent an infinite loop.',
					);
				if (((Y += 1), (G4 = !1), ($2 = v0 = null), B.updateQueue != null)) {
					var $ = B.updateQueue;
					(($.lastEffect = null),
						($.events = null),
						($.stores = null),
						$.memoCache != null && ($.memoCache.index = 0));
				}
				((p6 = -1), (A.H = rJ), ($ = gZ(X, G, Z)));
			} while (VX);
			return $;
		}
		function iQ() {
			var B = A.H,
				X = B.useState()[0];
			return (
				(X = typeof X.then === 'function' ? z3(X) : X),
				(B = B.useState()[0]),
				(v0 !== null ? v0.memoizedState : null) !== B && (c.flags |= 1024),
				X
			);
		}
		function EG() {
			var B = U9 !== 0;
			return ((U9 = 0), B);
		}
		function IG(B, X, G) {
			((X.updateQueue = B.updateQueue),
				(X.flags = (X.mode & f5) !== p ? X.flags & -402655237 : X.flags & -2053),
				(B.lanes &= ~G));
		}
		function VG(B) {
			if (J9) {
				for (B = B.memoizedState; B !== null;) {
					var X = B.queue;
					(X !== null && (X.pending = null), (B = B.next));
				}
				J9 = !1;
			}
			((s6 = 0),
				(T5 = $2 = v0 = c = null),
				(p6 = -1),
				(L = null),
				(VX = !1),
				(X4 = U9 = 0),
				(l6 = null));
		}
		function S2() {
			var B = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
			return ($2 === null ? (c.memoizedState = $2 = B) : ($2 = $2.next = B), $2);
		}
		function x0() {
			if (v0 === null) {
				var B = c.alternate;
				B = B !== null ? B.memoizedState : null;
			} else B = v0.next;
			var X = $2 === null ? c.memoizedState : $2.next;
			if (X !== null) (($2 = X), (v0 = B));
			else {
				if (B === null) {
					if (c.alternate === null)
						throw Error(
							'Update hook called on initial render. This is likely a bug in React. Please file an issue.',
						);
					throw Error('Rendered more hooks than during the previous render.');
				}
				((v0 = B),
					(B = {
						memoizedState: v0.memoizedState,
						baseState: v0.baseState,
						baseQueue: v0.baseQueue,
						queue: v0.queue,
						next: null,
					}),
					$2 === null ? (c.memoizedState = $2 = B) : ($2 = $2.next = B));
			}
			return $2;
		}
		function B7() {
			return { lastEffect: null, events: null, stores: null, memoCache: null };
		}
		function z3(B) {
			var X = X4;
			return (
				(X4 += 1),
				l6 === null && (l6 = E$()),
				(B = V$(l6, B, X)),
				(X = c),
				($2 === null ? X.memoizedState : $2.next) === null &&
					((X = X.alternate), (A.H = X !== null && X.memoizedState !== null ? sZ : dZ)),
				B
			);
		}
		function JB(B) {
			if (B !== null && typeof B === 'object') {
				if (typeof B.then === 'function') return z3(B);
				if (B.$$typeof === M6) return d0(B);
			}
			throw Error('An unsupported type was passed to use(): ' + String(B));
		}
		function Z1(B) {
			var X = null,
				G = c.updateQueue;
			if ((G !== null && (X = G.memoCache), X == null)) {
				var Z = c.alternate;
				Z !== null &&
					((Z = Z.updateQueue),
					Z !== null &&
						((Z = Z.memoCache),
						Z != null &&
							(X = {
								data: Z.data.map(function (Y) {
									return Y.slice();
								}),
								index: 0,
							})));
			}
			if (
				(X == null && (X = { data: [], index: 0 }),
				G === null && ((G = B7()), (c.updateQueue = G)),
				(G.memoCache = X),
				(G = X.data[X.index]),
				G === void 0 || G4)
			)
				for (G = X.data[X.index] = Array(B), Z = 0; Z < B; Z++) G[Z] = Qq;
			else
				G.length !== B &&
					console.error(
						'Expected a constant size argument for each invocation of useMemoCache. The previous cache was allocated with size %s but size %s was requested.',
						G.length,
						B,
					);
			return (X.index++, G);
		}
		function k5(B, X) {
			return typeof X === 'function' ? X(B) : X;
		}
		function CG(B, X, G) {
			var Z = S2();
			if (G !== void 0) {
				var Y = G(X);
				if (A1) {
					g0(!0);
					try {
						G(X);
					} finally {
						g0(!1);
					}
				}
			} else Y = X;
			return (
				(Z.memoizedState = Z.baseState = Y),
				(B = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: B,
					lastRenderedState: Y,
				}),
				(Z.queue = B),
				(B = B.dispatch = XM.bind(null, c, B)),
				[Z.memoizedState, B]
			);
		}
		function p1(B) {
			var X = x0();
			return DG(X, v0, B);
		}
		function DG(B, X, G) {
			var Z = B.queue;
			if (Z === null)
				throw Error(
					'Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)',
				);
			Z.lastRenderedReducer = G;
			var Y = B.baseQueue,
				$ = Z.pending;
			if ($ !== null) {
				if (Y !== null) {
					var R = Y.next;
					((Y.next = $.next), ($.next = R));
				}
				(X.baseQueue !== Y &&
					console.error(
						'Internal error: Expected work-in-progress queue to be a clone. This is a bug in React.',
					),
					(X.baseQueue = Y = $),
					(Z.pending = null));
			}
			if ((($ = B.baseState), Y === null)) B.memoizedState = $;
			else {
				X = Y.next;
				var z = (R = null),
					H = null,
					J = X,
					w = !1;
				do {
					var K = J.lane & -536870913;
					if (K !== J.lane ? (X0 & K) === K : (s6 & K) === K) {
						var M = J.revertLane;
						if (M === 0)
							(H !== null &&
								(H = H.next =
									{
										lane: 0,
										revertLane: 0,
										gesture: null,
										action: J.action,
										hasEagerState: J.hasEagerState,
										eagerState: J.eagerState,
										next: null,
									}),
								K === w1 && (w = !0));
						else if ((s6 & M) === M) {
							((J = J.next), M === w1 && (w = !0));
							continue;
						} else
							((K = {
								lane: 0,
								revertLane: J.revertLane,
								gesture: null,
								action: J.action,
								hasEagerState: J.hasEagerState,
								eagerState: J.eagerState,
								next: null,
							}),
								H === null ? ((z = H = K), (R = $)) : (H = H.next = K),
								(c.lanes |= M),
								(DB |= M));
						((K = J.action), A1 && G($, K), ($ = J.hasEagerState ? J.eagerState : G($, K)));
					} else
						((M = {
							lane: K,
							revertLane: J.revertLane,
							gesture: J.gesture,
							action: J.action,
							hasEagerState: J.hasEagerState,
							eagerState: J.eagerState,
							next: null,
						}),
							H === null ? ((z = H = M), (R = $)) : (H = H.next = M),
							(c.lanes |= K),
							(DB |= K));
					J = J.next;
				} while (J !== null && J !== X);
				if (
					(H === null ? (R = $) : (H.next = z),
					!m2($, B.memoizedState) && ((R2 = !0), w && ((G = FX), G !== null)))
				)
					throw G;
				((B.memoizedState = $), (B.baseState = R), (B.baseQueue = H), (Z.lastRenderedState = $));
			}
			return (Y === null && (Z.lanes = 0), [B.memoizedState, Z.dispatch]);
		}
		function H3(B) {
			var X = x0(),
				G = X.queue;
			if (G === null)
				throw Error(
					'Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)',
				);
			G.lastRenderedReducer = B;
			var { dispatch: Z, pending: Y } = G,
				$ = X.memoizedState;
			if (Y !== null) {
				G.pending = null;
				var R = (Y = Y.next);
				do (($ = B($, R.action)), (R = R.next));
				while (R !== Y);
				(m2($, X.memoizedState) || (R2 = !0),
					(X.memoizedState = $),
					X.baseQueue === null && (X.baseState = $),
					(G.lastRenderedState = $));
			}
			return [$, Z];
		}
		function TG(B, X, G) {
			var Z = c,
				Y = S2();
			if (H0) {
				if (G === void 0)
					throw Error(
						'Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.',
					);
				var $ = G();
				IX ||
					$ === G() ||
					(console.error(
						'The result of getServerSnapshot should be cached to avoid an infinite loop',
					),
					(IX = !0));
			} else {
				if (
					(($ = X()),
					IX ||
						((G = X()),
						m2($, G) ||
							(console.error(
								'The result of getSnapshot should be cached to avoid an infinite loop',
							),
							(IX = !0))),
					S0 === null)
				)
					throw Error(
						'Expected a work-in-progress root. This is a bug in React. Please file an issue.',
					);
				(X0 & 127) !== 0 || h$(Z, X, $);
			}
			return (
				(Y.memoizedState = $),
				(G = { value: $, getSnapshot: X }),
				(Y.queue = G),
				Y7(s$.bind(null, Z, G, B), [B]),
				(Z.flags |= 2048),
				a1(D5 | u2, { destroy: void 0 }, d$.bind(null, Z, G, $, X), null),
				$
			);
		}
		function X7(B, X, G) {
			var Z = c,
				Y = x0(),
				$ = H0;
			if ($) {
				if (G === void 0)
					throw Error(
						'Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.',
					);
				G = G();
			} else if (((G = X()), !IX)) {
				var R = X();
				m2(G, R) ||
					(console.error('The result of getSnapshot should be cached to avoid an infinite loop'),
					(IX = !0));
			}
			if ((R = !m2((v0 || Y).memoizedState, G))) ((Y.memoizedState = G), (R2 = !0));
			Y = Y.queue;
			var z = s$.bind(null, Z, Y, B);
			if (
				(s2(2048, u2, z, [B]),
				Y.getSnapshot !== X || R || ($2 !== null && $2.memoizedState.tag & D5))
			) {
				if (
					((Z.flags |= 2048),
					a1(D5 | u2, { destroy: void 0 }, d$.bind(null, Z, Y, G, X), null),
					S0 === null)
				)
					throw Error(
						'Expected a work-in-progress root. This is a bug in React. Please file an issue.',
					);
				$ || (s6 & 127) !== 0 || h$(Z, X, G);
			}
			return G;
		}
		function h$(B, X, G) {
			((B.flags |= 16384),
				(B = { getSnapshot: X, value: G }),
				(X = c.updateQueue),
				X === null
					? ((X = B7()), (c.updateQueue = X), (X.stores = [B]))
					: ((G = X.stores), G === null ? (X.stores = [B]) : G.push(B)));
		}
		function d$(B, X, G, Z) {
			((X.value = G), (X.getSnapshot = Z), l$(X) && p$(B));
		}
		function s$(B, X, G) {
			return G(function () {
				l$(X) && (r5(2, 'updateSyncExternalStore()', B), p$(B));
			});
		}
		function l$(B) {
			var X = B.getSnapshot;
			B = B.value;
			try {
				var G = X();
				return !m2(B, G);
			} catch (Z) {
				return !0;
			}
		}
		function p$(B) {
			var X = C2(B, 2);
			X !== null && n0(X, B, 2);
		}
		function vG(B) {
			var X = S2();
			if (typeof B === 'function') {
				var G = B;
				if (((B = G()), A1)) {
					g0(!0);
					try {
						G();
					} finally {
						g0(!1);
					}
				}
			}
			return (
				(X.memoizedState = X.baseState = B),
				(X.queue = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: k5,
					lastRenderedState: B,
				}),
				X
			);
		}
		function SG(B) {
			B = vG(B);
			var X = B.queue,
				G = UR.bind(null, c, X);
			return ((X.dispatch = G), [B.memoizedState, G]);
		}
		function gG(B) {
			var X = S2();
			X.memoizedState = X.baseState = B;
			var G = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: null,
				lastRenderedState: null,
			};
			return ((X.queue = G), (X = oG.bind(null, c, !0, G)), (G.dispatch = X), [B, X]);
		}
		function c$(B, X) {
			var G = x0();
			return a$(G, v0, B, X);
		}
		function a$(B, X, G, Z) {
			return ((B.baseState = G), DG(B, v0, typeof Z === 'function' ? Z : k5));
		}
		function o$(B, X) {
			var G = x0();
			if (v0 !== null) return a$(G, v0, B, X);
			return ((G.baseState = B), [B, G.queue.dispatch]);
		}
		function tQ(B, X, G, Z, Y) {
			if (U7(B)) throw Error('Cannot update form state while rendering.');
			if (((B = X.action), B !== null)) {
				var $ = {
					payload: Y,
					action: B,
					next: null,
					isTransition: !0,
					status: 'pending',
					value: null,
					reason: null,
					listeners: [],
					then: function (R) {
						$.listeners.push(R);
					},
				};
				(A.T !== null ? G(!0) : ($.isTransition = !1),
					Z($),
					(G = X.pending),
					G === null
						? (($.next = X.pending = $), n$(X, $))
						: (($.next = G.next), (X.pending = G.next = $)));
			}
		}
		function n$(B, X) {
			var { action: G, payload: Z } = X,
				Y = B.state;
			if (X.isTransition) {
				var $ = A.T,
					R = {};
				((R._updatedFibers = new Set()), (A.T = R));
				try {
					var z = G(Y, Z),
						H = A.S;
					(H !== null && H(R, z), i$(B, X, z));
				} catch (J) {
					kG(B, X, J);
				} finally {
					($ !== null &&
						R.types !== null &&
						($.types !== null &&
							$.types !== R.types &&
							console.error(
								'We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React.',
							),
						($.types = R.types)),
						(A.T = $),
						$ === null &&
							R._updatedFibers &&
							((B = R._updatedFibers.size),
							R._updatedFibers.clear(),
							10 < B &&
								console.warn(
									'Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.',
								)));
				}
			} else
				try {
					((R = G(Y, Z)), i$(B, X, R));
				} catch (J) {
					kG(B, X, J);
				}
		}
		function i$(B, X, G) {
			G !== null && typeof G === 'object' && typeof G.then === 'function'
				? (A.asyncTransitions++,
					G.then(J7, J7),
					G.then(
						function (Z) {
							t$(B, X, Z);
						},
						function (Z) {
							return kG(B, X, Z);
						},
					),
					X.isTransition ||
						console.error(
							'An async function with useActionState was called outside of a transition. This is likely not what you intended (for example, isPending will not update correctly). Either call the returned function inside startTransition, or pass it to an `action` or `formAction` prop.',
						))
				: t$(B, X, G);
		}
		function t$(B, X, G) {
			((X.status = 'fulfilled'),
				(X.value = G),
				r$(X),
				(B.state = G),
				(X = B.pending),
				X !== null &&
					((G = X.next), G === X ? (B.pending = null) : ((G = G.next), (X.next = G), n$(B, G))));
		}
		function kG(B, X, G) {
			var Z = B.pending;
			if (((B.pending = null), Z !== null)) {
				Z = Z.next;
				do ((X.status = 'rejected'), (X.reason = G), r$(X), (X = X.next));
				while (X !== Z);
			}
			B.action = null;
		}
		function r$(B) {
			B = B.listeners;
			for (var X = 0; X < B.length; X++) (0, B[X])();
		}
		function e$(B, X) {
			return X;
		}
		function c1(B, X) {
			if (H0) {
				var G = S0.formState;
				if (G !== null) {
					B: {
						var Z = c;
						if (H0) {
							if (f0) {
								X: {
									var Y = f0;
									for (var $ = I5; Y.nodeType !== 8;) {
										if (!$) {
											Y = null;
											break X;
										}
										if (((Y = H5(Y.nextSibling)), Y === null)) {
											Y = null;
											break X;
										}
									}
									(($ = Y.data), (Y = $ === MY || $ === mU ? Y : null));
								}
								if (Y) {
									((f0 = H5(Y.nextSibling)), (Z = Y.data === MY));
									break B;
								}
							}
							GB(Z);
						}
						Z = !1;
					}
					Z && (X = G[0]);
				}
			}
			return (
				(G = S2()),
				(G.memoizedState = G.baseState = X),
				(Z = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: e$,
					lastRenderedState: X,
				}),
				(G.queue = Z),
				(G = UR.bind(null, c, Z)),
				(Z.dispatch = G),
				(Z = vG(!1)),
				($ = oG.bind(null, c, !1, Z.queue)),
				(Z = S2()),
				(Y = { state: X, dispatch: null, action: B, pending: null }),
				(Z.queue = Y),
				(G = tQ.bind(null, c, Y, $, G)),
				(Y.dispatch = G),
				(Z.memoizedState = B),
				[X, G, !1]
			);
		}
		function G7(B) {
			var X = x0();
			return BR(X, v0, B);
		}
		function BR(B, X, G) {
			if (
				((X = DG(B, X, e$)[0]),
				(B = p1(k5)[0]),
				typeof X === 'object' && X !== null && typeof X.then === 'function')
			)
				try {
					var Z = z3(X);
				} catch (R) {
					if (R === PX) throw $9;
					throw R;
				}
			else Z = X;
			X = x0();
			var Y = X.queue,
				$ = Y.dispatch;
			return (
				G !== X.memoizedState &&
					((c.flags |= 2048), a1(D5 | u2, { destroy: void 0 }, rQ.bind(null, Y, G), null)),
				[Z, $, B]
			);
		}
		function rQ(B, X) {
			B.action = X;
		}
		function Z7(B) {
			var X = x0(),
				G = v0;
			if (G !== null) return BR(X, G, B);
			(x0(), (X = X.memoizedState), (G = x0()));
			var Z = G.queue.dispatch;
			return ((G.memoizedState = B), [X, Z, !1]);
		}
		function a1(B, X, G, Z) {
			return (
				(B = { tag: B, create: G, deps: Z, inst: X, next: null }),
				(X = c.updateQueue),
				X === null && ((X = B7()), (c.updateQueue = X)),
				(G = X.lastEffect),
				G === null
					? (X.lastEffect = B.next = B)
					: ((Z = G.next), (G.next = B), (B.next = Z), (X.lastEffect = B)),
				B
			);
		}
		function bG(B) {
			var X = S2();
			return ((B = { current: B }), (X.memoizedState = B));
		}
		function Y1(B, X, G, Z) {
			var Y = S2();
			((c.flags |= B),
				(Y.memoizedState = a1(D5 | X, { destroy: void 0 }, G, Z === void 0 ? null : Z)));
		}
		function s2(B, X, G, Z) {
			var Y = x0();
			Z = Z === void 0 ? null : Z;
			var $ = Y.memoizedState.inst;
			v0 !== null && Z !== null && PG(Z, v0.memoizedState.deps)
				? (Y.memoizedState = a1(X, $, G, Z))
				: ((c.flags |= B), (Y.memoizedState = a1(D5 | X, $, G, Z)));
		}
		function Y7(B, X) {
			(c.mode & f5) !== p ? Y1(276826112, u2, B, X) : Y1(8390656, u2, B, X);
		}
		function eQ(B) {
			c.flags |= 4;
			var X = c.updateQueue;
			if (X === null) ((X = B7()), (c.updateQueue = X), (X.events = [B]));
			else {
				var G = X.events;
				G === null ? (X.events = [B]) : G.push(B);
			}
		}
		function mG(B) {
			var X = S2(),
				G = { impl: B };
			return (
				(X.memoizedState = G),
				function () {
					if ((M0 & q2) !== L2)
						throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
					return G.impl.apply(void 0, arguments);
				}
			);
		}
		function $7(B) {
			var X = x0().memoizedState;
			return (
				eQ({ ref: X, nextImpl: B }),
				function () {
					if ((M0 & q2) !== L2)
						throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
					return X.impl.apply(void 0, arguments);
				}
			);
		}
		function yG(B, X) {
			var G = 4194308;
			return ((c.mode & f5) !== p && (G |= 134217728), Y1(G, W5, B, X));
		}
		function XR(B, X) {
			if (typeof X === 'function') {
				B = B();
				var G = X(B);
				return function () {
					typeof G === 'function' ? G() : X(null);
				};
			}
			if (X !== null && X !== void 0)
				return (
					X.hasOwnProperty('current') ||
						console.error(
							'Expected useImperativeHandle() first argument to either be a ref callback or React.createRef() object. Instead received: %s.',
							'an object with keys {' + Object.keys(X).join(', ') + '}',
						),
					(B = B()),
					(X.current = B),
					function () {
						X.current = null;
					}
				);
		}
		function fG(B, X, G) {
			(typeof X !== 'function' &&
				console.error(
					'Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.',
					X !== null ? typeof X : 'null',
				),
				(G = G !== null && G !== void 0 ? G.concat([B]) : null));
			var Z = 4194308;
			((c.mode & f5) !== p && (Z |= 134217728), Y1(Z, W5, XR.bind(null, X, B), G));
		}
		function R7(B, X, G) {
			(typeof X !== 'function' &&
				console.error(
					'Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.',
					X !== null ? typeof X : 'null',
				),
				(G = G !== null && G !== void 0 ? G.concat([B]) : null),
				s2(4, W5, XR.bind(null, X, B), G));
		}
		function uG(B, X) {
			return ((S2().memoizedState = [B, X === void 0 ? null : X]), B);
		}
		function z7(B, X) {
			var G = x0();
			X = X === void 0 ? null : X;
			var Z = G.memoizedState;
			if (X !== null && PG(X, Z[1])) return Z[0];
			return ((G.memoizedState = [B, X]), B);
		}
		function hG(B, X) {
			var G = S2();
			X = X === void 0 ? null : X;
			var Z = B();
			if (A1) {
				g0(!0);
				try {
					B();
				} finally {
					g0(!1);
				}
			}
			return ((G.memoizedState = [Z, X]), Z);
		}
		function H7(B, X) {
			var G = x0();
			X = X === void 0 ? null : X;
			var Z = G.memoizedState;
			if (X !== null && PG(X, Z[1])) return Z[0];
			if (((Z = B()), A1)) {
				g0(!0);
				try {
					B();
				} finally {
					g0(!1);
				}
			}
			return ((G.memoizedState = [Z, X]), Z);
		}
		function dG(B, X) {
			var G = S2();
			return sG(G, B, X);
		}
		function GR(B, X) {
			var G = x0();
			return YR(G, v0.memoizedState, B, X);
		}
		function ZR(B, X) {
			var G = x0();
			return v0 === null ? sG(G, B, X) : YR(G, v0.memoizedState, B, X);
		}
		function sG(B, X, G) {
			if (G === void 0 || ((s6 & 1073741824) !== 0 && (X0 & 261930) === 0))
				return (B.memoizedState = X);
			return ((B.memoizedState = G), (B = $z()), (c.lanes |= B), (DB |= B), G);
		}
		function YR(B, X, G, Z) {
			if (m2(G, X)) return G;
			if (NX.current !== null) return ((B = sG(B, G, Z)), m2(B, X) || (R2 = !0), B);
			if ((s6 & 42) === 0 || ((s6 & 1073741824) !== 0 && (X0 & 261930) === 0))
				return ((R2 = !0), (B.memoizedState = G));
			return ((B = $z()), (c.lanes |= B), (DB |= B), X);
		}
		function J7() {
			A.asyncTransitions--;
		}
		function $R(B, X, G, Z, Y) {
			var $ = L0.p;
			L0.p = $ !== 0 && $ < y5 ? $ : y5;
			var R = A.T,
				z = {};
			((z._updatedFibers = new Set()), (A.T = z), oG(B, !1, X, G));
			try {
				var H = Y(),
					J = A.S;
				if (
					(J !== null && J(z, H),
					H !== null && typeof H === 'object' && typeof H.then === 'function')
				) {
					(A.asyncTransitions++, H.then(J7, J7));
					var w = oQ(H, Z);
					J3(B, X, w, z5(B));
				} else J3(B, X, Z, z5(B));
			} catch (K) {
				J3(B, X, { then: function () {}, status: 'rejected', reason: K }, z5(B));
			} finally {
				((L0.p = $),
					R !== null &&
						z.types !== null &&
						(R.types !== null &&
							R.types !== z.types &&
							console.error(
								'We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React.',
							),
						(R.types = z.types)),
					(A.T = R),
					R === null &&
						z._updatedFibers &&
						((B = z._updatedFibers.size),
						z._updatedFibers.clear(),
						10 < B &&
							console.warn(
								'Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.',
							)));
			}
		}
		function lG(B, X, G, Z) {
			if (B.tag !== 5)
				throw Error('Expected the form instance to be a HostComponent. This is a bug in React.');
			var Y = RR(B).queue;
			(cQ(B),
				$R(
					B,
					Y,
					X,
					T1,
					G === null
						? v2
						: function () {
								return (zR(B), G(Z));
							},
				));
		}
		function RR(B) {
			var X = B.memoizedState;
			if (X !== null) return X;
			X = {
				memoizedState: T1,
				baseState: T1,
				baseQueue: null,
				queue: {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: k5,
					lastRenderedState: T1,
				},
				next: null,
			};
			var G = {};
			return (
				(X.next = {
					memoizedState: G,
					baseState: G,
					baseQueue: null,
					queue: {
						pending: null,
						lanes: 0,
						dispatch: null,
						lastRenderedReducer: k5,
						lastRenderedState: G,
					},
					next: null,
				}),
				(B.memoizedState = X),
				(B = B.alternate),
				B !== null && (B.memoizedState = X),
				X
			);
		}
		function zR(B) {
			A.T === null &&
				console.error(
					'requestFormReset was called outside a transition or action. To fix, move to an action, or wrap with startTransition.',
				);
			var X = RR(B);
			(X.next === null && (X = B.alternate.memoizedState), J3(B, X.next.queue, {}, z5(B)));
		}
		function pG() {
			var B = vG(!1);
			return ((B = $R.bind(null, c, B.queue, !0, !1)), (S2().memoizedState = B), [!1, B]);
		}
		function HR() {
			var B = p1(k5)[0],
				X = x0().memoizedState;
			return [typeof B === 'boolean' ? B : z3(B), X];
		}
		function JR() {
			var B = H3(k5)[0],
				X = x0().memoizedState;
			return [typeof B === 'boolean' ? B : z3(B), X];
		}
		function $1() {
			return d0(_4);
		}
		function cG() {
			var B = S2(),
				X = S0.identifierPrefix;
			if (H0) {
				var G = y6,
					Z = m6;
				((G = (Z & ~(1 << (32 - g2(Z) - 1))).toString(32) + G),
					(X = '_' + X + 'R_' + G),
					(G = U9++),
					0 < G && (X += 'H' + G.toString(32)),
					(X += '_'));
			} else ((G = vW++), (X = '_' + X + 'r_' + G.toString(32) + '_'));
			return (B.memoizedState = X);
		}
		function aG() {
			return (S2().memoizedState = BM.bind(null, c));
		}
		function BM(B, X) {
			for (var G = B.return; G !== null;) {
				switch (G.tag) {
					case 24:
					case 3:
						var Z = z5(G),
							Y = $B(Z),
							$ = RB(G, Y, Z);
						($ !== null && (r5(Z, 'refresh()', B), n0($, G, Z), Y3($, G, Z)),
							(B = qG()),
							X !== null &&
								X !== void 0 &&
								$ !== null &&
								console.error('The seed argument is not enabled outside experimental channels.'),
							(Y.payload = { cache: B }));
						return;
				}
				G = G.return;
			}
		}
		function XM(B, X, G) {
			var Z = arguments;
			(typeof Z[3] === 'function' &&
				console.error(
					"State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect().",
				),
				(Z = z5(B)));
			var Y = {
				lane: Z,
				revertLane: 0,
				gesture: null,
				action: G,
				hasEagerState: !1,
				eagerState: null,
				next: null,
			};
			U7(B)
				? QR(X, Y)
				: ((Y = XG(B, X, Y, Z)), Y !== null && (r5(Z, 'dispatch()', B), n0(Y, B, Z), MR(Y, X, Z)));
		}
		function UR(B, X, G) {
			var Z = arguments;
			(typeof Z[3] === 'function' &&
				console.error(
					"State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect().",
				),
				(Z = z5(B)),
				J3(B, X, G, Z) && r5(Z, 'setState()', B));
		}
		function J3(B, X, G, Z) {
			var Y = {
				lane: Z,
				revertLane: 0,
				gesture: null,
				action: G,
				hasEagerState: !1,
				eagerState: null,
				next: null,
			};
			if (U7(B)) QR(X, Y);
			else {
				var $ = B.alternate;
				if (
					B.lanes === 0 &&
					($ === null || $.lanes === 0) &&
					(($ = X.lastRenderedReducer), $ !== null)
				) {
					var R = A.H;
					A.H = h5;
					try {
						var z = X.lastRenderedState,
							H = $(z, G);
						if (((Y.hasEagerState = !0), (Y.eagerState = H), m2(H, z)))
							return (b4(B, X, Y, 0), S0 === null && k4(), !1);
					} catch (J) {
					} finally {
						A.H = R;
					}
				}
				if (((G = XG(B, X, Y, Z)), G !== null)) return (n0(G, B, Z), MR(G, X, Z), !0);
			}
			return !1;
		}
		function oG(B, X, G, Z) {
			if (
				(A.T === null &&
					w1 === 0 &&
					console.error(
						'An optimistic state update occurred outside a transition or action. To fix, move the update to an action, or wrap with startTransition.',
					),
				(Z = {
					lane: 2,
					revertLane: x8(),
					gesture: null,
					action: Z,
					hasEagerState: !1,
					eagerState: null,
					next: null,
				}),
				U7(B))
			) {
				if (X) throw Error('Cannot update optimistic state while rendering.');
				console.error('Cannot call startTransition while rendering.');
			} else ((X = XG(B, G, Z, 2)), X !== null && (r5(2, 'setOptimistic()', B), n0(X, B, 2)));
		}
		function U7(B) {
			var X = B.alternate;
			return B === c || (X !== null && X === c);
		}
		function QR(B, X) {
			VX = J9 = !0;
			var G = B.pending;
			(G === null ? (X.next = X) : ((X.next = G.next), (G.next = X)), (B.pending = X));
		}
		function MR(B, X, G) {
			if ((G & 4194048) !== 0) {
				var Z = X.lanes;
				((Z &= B.pendingLanes), (G |= Z), (X.lanes = G), pB(B, G));
			}
		}
		function nG(B) {
			if (B !== null && typeof B !== 'function') {
				var X = String(B);
				JU.has(X) ||
					(JU.add(X),
					console.error(
						'Expected the last optional `callback` argument to be a function. Instead received: %s.',
						B,
					));
			}
		}
		function iG(B, X, G, Z) {
			var Y = B.memoizedState,
				$ = G(Z, Y);
			if (B.mode & T2) {
				g0(!0);
				try {
					$ = G(Z, Y);
				} finally {
					g0(!1);
				}
			}
			($ === void 0 &&
				((X = J0(X) || 'Component'),
				$U.has(X) ||
					($U.add(X),
					console.error(
						'%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.',
						X,
					))),
				(Y = $ === null || $ === void 0 ? Y : Y0({}, Y, $)),
				(B.memoizedState = Y),
				B.lanes === 0 && (B.updateQueue.baseState = Y));
		}
		function qR(B, X, G, Z, Y, $, R) {
			var z = B.stateNode;
			if (typeof z.shouldComponentUpdate === 'function') {
				if (((G = z.shouldComponentUpdate(Z, $, R)), B.mode & T2)) {
					g0(!0);
					try {
						G = z.shouldComponentUpdate(Z, $, R);
					} finally {
						g0(!1);
					}
				}
				return (
					G === void 0 &&
						console.error(
							'%s.shouldComponentUpdate(): Returned undefined instead of a boolean value. Make sure to return true or false.',
							J0(X) || 'Component',
						),
					G
				);
			}
			return X.prototype && X.prototype.isPureReactComponent ? !tX(G, Z) || !tX(Y, $) : !0;
		}
		function WR(B, X, G, Z) {
			var Y = X.state;
			(typeof X.componentWillReceiveProps === 'function' && X.componentWillReceiveProps(G, Z),
				typeof X.UNSAFE_componentWillReceiveProps === 'function' &&
					X.UNSAFE_componentWillReceiveProps(G, Z),
				X.state !== Y &&
					((B = v(B) || 'Component'),
					BU.has(B) ||
						(BU.add(B),
						console.error(
							"%s.componentWillReceiveProps(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
							B,
						)),
					lZ.enqueueReplaceState(X, X.state, null)));
		}
		function R1(B, X) {
			var G = X;
			if ('ref' in X) {
				G = {};
				for (var Z in X) Z !== 'ref' && (G[Z] = X[Z]);
			}
			if ((B = B.defaultProps)) {
				G === X && (G = Y0({}, G));
				for (var Y in B) G[Y] === void 0 && (G[Y] = B[Y]);
			}
			return G;
		}
		function wR(B) {
			(jZ(B),
				console.warn(
					`%s

%s
`,
					CX
						? 'An error occurred in the <' + CX + '> component.'
						: 'An error occurred in one of your React components.',
					`Consider adding an error boundary to your tree to customize error handling behavior.
Visit https://react.dev/link/error-boundaries to learn more about error boundaries.`,
				));
		}
		function KR(B) {
			var X = CX
					? 'The above error occurred in the <' + CX + '> component.'
					: 'The above error occurred in one of your React components.',
				G =
					'React will try to recreate this component tree from scratch using the error boundary you provided, ' +
					((pZ || 'Anonymous') + '.');
			if (typeof B === 'object' && B !== null && typeof B.environmentName === 'string') {
				var Z = B.environmentName;
				((B = [
					`%o

%s

%s
`,
					B,
					X,
					G,
				].slice(0)),
					typeof B[0] === 'string'
						? B.splice(0, 1, pU + ' ' + B[0], cU, k9 + Z + k9, aU)
						: B.splice(0, 0, pU, cU, k9 + Z + k9, aU),
					B.unshift(console),
					(Z = eW.apply(console.error, B)),
					Z());
			} else
				console.error(
					`%o

%s

%s
`,
					B,
					X,
					G,
				);
		}
		function OR(B) {
			jZ(B);
		}
		function Q7(B, X) {
			try {
				((CX = X.source ? v(X.source) : null), (pZ = null));
				var G = X.value;
				if (A.actQueue !== null) A.thrownErrors.push(G);
				else {
					var Z = B.onUncaughtError;
					Z(G, { componentStack: X.stack });
				}
			} catch (Y) {
				setTimeout(function () {
					throw Y;
				});
			}
		}
		function _R(B, X, G) {
			try {
				((CX = G.source ? v(G.source) : null), (pZ = v(X)));
				var Z = B.onCaughtError;
				Z(G.value, { componentStack: G.stack, errorBoundary: X.tag === 1 ? X.stateNode : null });
			} catch (Y) {
				setTimeout(function () {
					throw Y;
				});
			}
		}
		function tG(B, X, G) {
			return (
				(G = $B(G)),
				(G.tag = yZ),
				(G.payload = { element: null }),
				(G.callback = function () {
					k(X.source, Q7, B, X);
				}),
				G
			);
		}
		function rG(B) {
			return ((B = $B(B)), (B.tag = yZ), B);
		}
		function eG(B, X, G, Z) {
			var Y = G.type.getDerivedStateFromError;
			if (typeof Y === 'function') {
				var $ = Z.value;
				((B.payload = function () {
					return Y($);
				}),
					(B.callback = function () {
						(Q$(G), k(Z.source, _R, X, G, Z));
					}));
			}
			var R = G.stateNode;
			R !== null &&
				typeof R.componentDidCatch === 'function' &&
				(B.callback = function () {
					(Q$(G),
						k(Z.source, _R, X, G, Z),
						typeof Y !== 'function' && (vB === null ? (vB = new Set([this])) : vB.add(this)),
						VW(this, Z),
						typeof Y === 'function' ||
							((G.lanes & 2) === 0 &&
								console.error(
									'%s: Error boundaries should implement getDerivedStateFromError(). In that method, return a state update to display an error message or fallback UI.',
									v(G) || 'Unknown',
								)));
				});
		}
		function GM(B, X, G, Z, Y) {
			if (
				((G.flags |= 32768),
				w6 && O3(B, Y),
				Z !== null && typeof Z === 'object' && typeof Z.then === 'function')
			) {
				if (
					((X = G.alternate),
					X !== null && s1(X, G, Y, !0),
					H0 && (_6 = !0),
					(G = q5.current),
					G !== null)
				) {
					switch (G.tag) {
						case 31:
						case 13:
							return (
								C5 === null ? A7() : G.alternate === null && a0 === a6 && (a0 = q9),
								(G.flags &= -257),
								(G.flags |= 65536),
								(G.lanes = Y),
								Z === R9
									? (G.flags |= 16384)
									: ((X = G.updateQueue),
										X === null ? (G.updateQueue = new Set([Z])) : X.add(Z),
										A8(B, Z, Y)),
								!1
							);
						case 22:
							return (
								(G.flags |= 65536),
								Z === R9
									? (G.flags |= 16384)
									: ((X = G.updateQueue),
										X === null
											? ((X = {
													transitions: null,
													markerInstances: null,
													retryQueue: new Set([Z]),
												}),
												(G.updateQueue = X))
											: ((G = X.retryQueue), G === null ? (X.retryQueue = new Set([Z])) : G.add(Z)),
										A8(B, Z, Y)),
								!1
							);
					}
					throw Error('Unexpected Suspense handler tag (' + G.tag + '). This is a bug in React.');
				}
				return (A8(B, Z, Y), A7(), !1);
			}
			if (H0)
				return (
					(_6 = !0),
					(X = q5.current),
					X !== null
						? ((X.flags & 65536) === 0 && (X.flags |= 256),
							(X.flags |= 65536),
							(X.lanes = Y),
							Z !== IZ &&
								eX(
									Z5(
										Error(
											'There was an error while hydrating but React was able to recover by instead client rendering from the nearest Suspense boundary.',
											{ cause: Z },
										),
										G,
									),
								))
						: (Z !== IZ &&
								eX(
									Z5(
										Error(
											'There was an error while hydrating but React was able to recover by instead client rendering the entire root.',
											{ cause: Z },
										),
										G,
									),
								),
							(B = B.current.alternate),
							(B.flags |= 65536),
							(Y &= -Y),
							(B.lanes |= Y),
							(Z = Z5(Z, G)),
							(Y = tG(B.stateNode, Z, Y)),
							t4(B, Y),
							a0 !== VB && (a0 = j1)),
					!1
				);
			var $ = Z5(
				Error(
					'There was an error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root.',
					{ cause: Z },
				),
				G,
			);
			if ((J4 === null ? (J4 = [$]) : J4.push($), a0 !== VB && (a0 = j1), X === null)) return !0;
			((Z = Z5(Z, G)), (G = X));
			do {
				switch (G.tag) {
					case 3:
						return (
							(G.flags |= 65536),
							(B = Y & -Y),
							(G.lanes |= B),
							(B = tG(G.stateNode, Z, B)),
							t4(G, B),
							!1
						);
					case 1:
						if (
							((X = G.type),
							($ = G.stateNode),
							(G.flags & 128) === 0 &&
								(typeof X.getDerivedStateFromError === 'function' ||
									($ !== null &&
										typeof $.componentDidCatch === 'function' &&
										(vB === null || !vB.has($)))))
						)
							return (
								(G.flags |= 65536),
								(Y &= -Y),
								(G.lanes |= Y),
								(Y = rG(Y)),
								eG(Y, B, G, Z),
								t4(G, Y),
								!1
							);
				}
				G = G.return;
			} while (G !== null);
			return !1;
		}
		function P2(B, X, G, Z) {
			X.child = B === null ? sJ(X, null, G, Z) : L1(X, B.child, G, Z);
		}
		function LR(B, X, G, Z, Y) {
			G = G.render;
			var $ = X.ref;
			if ('ref' in Z) {
				var R = {};
				for (var z in Z) z !== 'ref' && (R[z] = Z[z]);
			} else R = Z;
			if ((X1(X), (Z = xG(B, X, G, R, $, Y)), (z = EG()), B !== null && !R2))
				return (IG(B, X, Y), T6(B, X, Y));
			return (H0 && z && zG(X), (X.flags |= 1), P2(B, X, Z, Y), X.child);
		}
		function AR(B, X, G, Z, Y) {
			if (B === null) {
				var $ = G.type;
				if (typeof $ === 'function' && !ZG($) && $.defaultProps === void 0 && G.compare === null)
					return ((G = tB($)), (X.tag = 15), (X.type = G), X8(X, $), jR(B, X, G, Z, Y));
				return (
					(B = YG(G.type, null, Z, X, X.mode, Y)),
					(B.ref = X.ref),
					(B.return = X),
					(X.child = B)
				);
			}
			if ((($ = B.child), !z8(B, Y))) {
				var R = $.memoizedProps;
				if (((G = G.compare), (G = G !== null ? G : tX), G(R, Z) && B.ref === X.ref))
					return T6(B, X, Y);
			}
			return ((X.flags |= 1), (B = I6($, Z)), (B.ref = X.ref), (B.return = X), (X.child = B));
		}
		function jR(B, X, G, Z, Y) {
			if (B !== null) {
				var $ = B.memoizedProps;
				if (tX($, Z) && B.ref === X.ref && X.type === B.type)
					if (((R2 = !1), (X.pendingProps = Z = $), z8(B, Y)))
						(B.flags & 131072) !== 0 && (R2 = !0);
					else return ((X.lanes = B.lanes), T6(B, X, Y));
			}
			return B8(B, X, G, Z, Y);
		}
		function FR(B, X, G, Z) {
			var Y = Z.children,
				$ = B !== null ? B.memoizedState : null;
			if (
				(B === null &&
					X.stateNode === null &&
					(X.stateNode = {
						_visibility: y3,
						_pendingMarkers: null,
						_retryCache: null,
						_transitions: null,
					}),
				Z.mode === 'hidden')
			) {
				if ((X.flags & 128) !== 0) {
					if ((($ = $ !== null ? $.baseLanes | G : G), B !== null)) {
						Z = X.child = B.child;
						for (Y = 0; Z !== null;) ((Y = Y | Z.lanes | Z.childLanes), (Z = Z.sibling));
						Z = Y & ~$;
					} else ((Z = 0), (X.child = null));
					return PR(B, X, $, G, Z);
				}
				if ((G & 536870912) !== 0)
					((X.memoizedState = { baseLanes: 0, cachePool: null }),
						B !== null && p4(X, $ !== null ? $.cachePool : null),
						$ !== null ? y$(X, $) : AG(X),
						f$(X));
				else return ((Z = X.lanes = 536870912), PR(B, X, $ !== null ? $.baseLanes | G : G, G, Z));
			} else
				$ !== null
					? (p4(X, $.cachePool), y$(X, $), HB(X), (X.memoizedState = null))
					: (B !== null && p4(X, null), AG(X), HB(X));
			return (P2(B, X, Y, G), X.child);
		}
		function U3(B, X) {
			return (
				(B !== null && B.tag === 22) ||
					X.stateNode !== null ||
					(X.stateNode = {
						_visibility: y3,
						_pendingMarkers: null,
						_retryCache: null,
						_transitions: null,
					}),
				X.sibling
			);
		}
		function PR(B, X, G, Z, Y) {
			var $ = KG();
			return (
				($ = $ === null ? null : { parent: Z2._currentValue, pool: $ }),
				(X.memoizedState = { baseLanes: G, cachePool: $ }),
				B !== null && p4(X, null),
				AG(X),
				f$(X),
				B !== null && s1(B, X, Z, !0),
				(X.childLanes = Y),
				null
			);
		}
		function M7(B, X) {
			var G = X.hidden;
			return (
				G !== void 0 &&
					console.error(
						`<Activity> doesn't accept a hidden prop. Use mode="hidden" instead.
- <Activity %s>
+ <Activity %s>`,
						G === !0 ? 'hidden' : G === !1 ? 'hidden={false}' : 'hidden={...}',
						G ? 'mode="hidden"' : 'mode="visible"',
					),
				(X = W7({ mode: X.mode, children: X.children }, B.mode)),
				(X.ref = B.ref),
				(B.child = X),
				(X.return = B),
				X
			);
		}
		function xR(B, X, G) {
			return (
				L1(X, B.child, null, G),
				(B = M7(X, X.pendingProps)),
				(B.flags |= 2),
				R5(X),
				(X.memoizedState = null),
				B
			);
		}
		function ZM(B, X, G) {
			var Z = X.pendingProps,
				Y = (X.flags & 128) !== 0;
			if (((X.flags &= -129), B === null)) {
				if (H0) {
					if (Z.mode === 'hidden') return ((B = M7(X, Z)), (X.lanes = 536870912), U3(null, B));
					if (
						(FG(X),
						(B = f0)
							? ((G = nz(B, I5)),
								(G = G !== null && G.data === I1 ? G : null),
								G !== null &&
									((Z = {
										dehydrated: G,
										treeContext: K$(),
										retryLane: 536870912,
										hydrationErrors: null,
									}),
									(X.memoizedState = Z),
									(Z = W$(G)),
									(Z.return = X),
									(X.child = Z),
									(E2 = X),
									(f0 = null)))
							: (G = null),
						G === null)
					)
						throw (f4(X, B), GB(X));
					return ((X.lanes = 536870912), null);
				}
				return M7(X, Z);
			}
			var $ = B.memoizedState;
			if ($ !== null) {
				var R = $.dehydrated;
				if ((FG(X), Y))
					if (X.flags & 256) ((X.flags &= -257), (X = xR(B, X, G)));
					else if (X.memoizedState !== null) ((X.child = B.child), (X.flags |= 128), (X = null));
					else
						throw Error('Client rendering an Activity suspended it again. This is a bug in React.');
				else if (
					(_$(),
					(G & 536870912) !== 0 && L7(X),
					R2 || s1(B, X, G, !1),
					(Y = (G & B.childLanes) !== 0),
					R2 || Y)
				) {
					if (((Z = S0), Z !== null && ((R = cB(Z, G)), R !== 0 && R !== $.retryLane)))
						throw (($.retryLane = R), C2(B, R), n0(Z, B, R), cZ);
					(A7(), (X = xR(B, X, G)));
				} else
					((B = $.treeContext),
						(f0 = H5(R.nextSibling)),
						(E2 = X),
						(H0 = !0),
						(jB = null),
						(_6 = !1),
						(M5 = null),
						(I5 = !1),
						B !== null && O$(X, B),
						(X = M7(X, Z)),
						(X.flags |= 4096));
				return X;
			}
			return (
				($ = B.child),
				(Z = { mode: Z.mode, children: Z.children }),
				(G & 536870912) !== 0 && (G & B.lanes) !== 0 && L7(X),
				(B = I6($, Z)),
				(B.ref = X.ref),
				(X.child = B),
				(B.return = X),
				B
			);
		}
		function q7(B, X) {
			var G = X.ref;
			if (G === null) B !== null && B.ref !== null && (X.flags |= 4194816);
			else {
				if (typeof G !== 'function' && typeof G !== 'object')
					throw Error(
						'Expected ref to be a function, an object returned by React.createRef(), or undefined/null.',
					);
				if (B === null || B.ref !== G) X.flags |= 4194816;
			}
		}
		function B8(B, X, G, Z, Y) {
			if (G.prototype && typeof G.prototype.render === 'function') {
				var $ = J0(G) || 'Unknown';
				UU[$] ||
					(console.error(
						"The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
						$,
						$,
					),
					(UU[$] = !0));
			}
			if (
				(X.mode & T2 && u5.recordLegacyContextWarning(X, null),
				B === null &&
					(X8(X, X.type),
					G.contextTypes &&
						(($ = J0(G) || 'Unknown'),
						MU[$] ||
							((MU[$] = !0),
							console.error(
								'%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)',
								$,
							)))),
				X1(X),
				(G = xG(B, X, G, Z, void 0, Y)),
				(Z = EG()),
				B !== null && !R2)
			)
				return (IG(B, X, Y), T6(B, X, Y));
			return (H0 && Z && zG(X), (X.flags |= 1), P2(B, X, G, Y), X.child);
		}
		function NR(B, X, G, Z, Y, $) {
			if (
				(X1(X),
				(p6 = -1),
				(G4 = B !== null && B.type !== X.type),
				(X.updateQueue = null),
				(G = NG(X, Z, G, Y)),
				u$(B, X),
				(Z = EG()),
				B !== null && !R2)
			)
				return (IG(B, X, $), T6(B, X, $));
			return (H0 && Z && zG(X), (X.flags |= 1), P2(B, X, G, $), X.child);
		}
		function ER(B, X, G, Z, Y) {
			switch (X2(X)) {
				case !1:
					var $ = X.stateNode,
						R = new X.type(X.memoizedProps, $.context).state;
					$.updater.enqueueSetState($, R, null);
					break;
				case !0:
					((X.flags |= 128),
						(X.flags |= 65536),
						($ = Error('Simulated error coming from DevTools')));
					var z = Y & -Y;
					if (((X.lanes |= z), (R = S0), R === null))
						throw Error(
							'Expected a work-in-progress root. This is a bug in React. Please file an issue.',
						);
					((z = rG(z)), eG(z, R, X, Z5($, X)), t4(X, z));
			}
			if ((X1(X), X.stateNode === null)) {
				if (
					((R = AB),
					($ = G.contextType),
					'contextType' in G &&
						$ !== null &&
						($ === void 0 || $.$$typeof !== M6) &&
						!HU.has(G) &&
						(HU.add(G),
						(z =
							$ === void 0
								? ' However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file.'
								: typeof $ !== 'object'
									? ' However, it is set to a ' + typeof $ + '.'
									: $.$$typeof === a8
										? ' Did you accidentally pass the Context.Consumer instead?'
										: ' However, it is set to an object with keys {' +
											Object.keys($).join(', ') +
											'}.'),
						console.error(
							'%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s',
							J0(G) || 'Component',
							z,
						)),
					typeof $ === 'object' && $ !== null && (R = d0($)),
					($ = new G(Z, R)),
					X.mode & T2)
				) {
					g0(!0);
					try {
						$ = new G(Z, R);
					} finally {
						g0(!1);
					}
				}
				if (
					((R = X.memoizedState = $.state !== null && $.state !== void 0 ? $.state : null),
					($.updater = lZ),
					(X.stateNode = $),
					($._reactInternals = X),
					($._reactInternalInstance = eJ),
					typeof G.getDerivedStateFromProps === 'function' &&
						R === null &&
						((R = J0(G) || 'Component'),
						XU.has(R) ||
							(XU.add(R),
							console.error(
								'`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.',
								R,
								$.state === null ? 'null' : 'undefined',
								R,
							))),
					typeof G.getDerivedStateFromProps === 'function' ||
						typeof $.getSnapshotBeforeUpdate === 'function')
				) {
					var H = (z = R = null);
					if (
						(typeof $.componentWillMount === 'function' &&
						$.componentWillMount.__suppressDeprecationWarning !== !0
							? (R = 'componentWillMount')
							: typeof $.UNSAFE_componentWillMount === 'function' &&
								(R = 'UNSAFE_componentWillMount'),
						typeof $.componentWillReceiveProps === 'function' &&
						$.componentWillReceiveProps.__suppressDeprecationWarning !== !0
							? (z = 'componentWillReceiveProps')
							: typeof $.UNSAFE_componentWillReceiveProps === 'function' &&
								(z = 'UNSAFE_componentWillReceiveProps'),
						typeof $.componentWillUpdate === 'function' &&
						$.componentWillUpdate.__suppressDeprecationWarning !== !0
							? (H = 'componentWillUpdate')
							: typeof $.UNSAFE_componentWillUpdate === 'function' &&
								(H = 'UNSAFE_componentWillUpdate'),
						R !== null || z !== null || H !== null)
					) {
						$ = J0(G) || 'Component';
						var J =
							typeof G.getDerivedStateFromProps === 'function'
								? 'getDerivedStateFromProps()'
								: 'getSnapshotBeforeUpdate()';
						ZU.has($) ||
							(ZU.add($),
							console.error(
								`Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`,
								$,
								J,
								R !== null
									? `
  ` + R
									: '',
								z !== null
									? `
  ` + z
									: '',
								H !== null
									? `
  ` + H
									: '',
							));
					}
				}
				(($ = X.stateNode),
					(R = J0(G) || 'Component'),
					$.render ||
						(G.prototype && typeof G.prototype.render === 'function'
							? console.error(
									'No `render` method found on the %s instance: did you accidentally return an object from the constructor?',
									R,
								)
							: console.error(
									'No `render` method found on the %s instance: you may have forgotten to define `render`.',
									R,
								)),
					!$.getInitialState ||
						$.getInitialState.isReactClassApproved ||
						$.state ||
						console.error(
							'getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?',
							R,
						),
					$.getDefaultProps &&
						!$.getDefaultProps.isReactClassApproved &&
						console.error(
							'getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.',
							R,
						),
					$.contextType &&
						console.error(
							'contextType was defined as an instance property on %s. Use a static property to define contextType instead.',
							R,
						),
					G.childContextTypes &&
						!zU.has(G) &&
						(zU.add(G),
						console.error(
							'%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)',
							R,
						)),
					G.contextTypes &&
						!RU.has(G) &&
						(RU.add(G),
						console.error(
							'%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)',
							R,
						)),
					typeof $.componentShouldUpdate === 'function' &&
						console.error(
							'%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.',
							R,
						),
					G.prototype &&
						G.prototype.isPureReactComponent &&
						typeof $.shouldComponentUpdate < 'u' &&
						console.error(
							'%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.',
							J0(G) || 'A pure component',
						),
					typeof $.componentDidUnmount === 'function' &&
						console.error(
							'%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?',
							R,
						),
					typeof $.componentDidReceiveProps === 'function' &&
						console.error(
							'%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().',
							R,
						),
					typeof $.componentWillRecieveProps === 'function' &&
						console.error(
							'%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?',
							R,
						),
					typeof $.UNSAFE_componentWillRecieveProps === 'function' &&
						console.error(
							'%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?',
							R,
						),
					(z = $.props !== Z),
					$.props !== void 0 &&
						z &&
						console.error(
							"When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.",
							R,
						),
					$.defaultProps &&
						console.error(
							'Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.',
							R,
							R,
						),
					typeof $.getSnapshotBeforeUpdate !== 'function' ||
						typeof $.componentDidUpdate === 'function' ||
						GU.has(G) ||
						(GU.add(G),
						console.error(
							'%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.',
							J0(G),
						)),
					typeof $.getDerivedStateFromProps === 'function' &&
						console.error(
							'%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.',
							R,
						),
					typeof $.getDerivedStateFromError === 'function' &&
						console.error(
							'%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.',
							R,
						),
					typeof G.getSnapshotBeforeUpdate === 'function' &&
						console.error(
							'%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.',
							R,
						),
					(z = $.state) &&
						(typeof z !== 'object' || Q2(z)) &&
						console.error('%s.state: must be set to an object or null', R),
					typeof $.getChildContext === 'function' &&
						typeof G.childContextTypes !== 'object' &&
						console.error(
							'%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().',
							R,
						),
					($ = X.stateNode),
					($.props = Z),
					($.state = X.memoizedState),
					($.refs = {}),
					_G(X),
					(R = G.contextType),
					($.context = typeof R === 'object' && R !== null ? d0(R) : AB),
					$.state === Z &&
						((R = J0(G) || 'Component'),
						YU.has(R) ||
							(YU.add(R),
							console.error(
								"%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.",
								R,
							))),
					X.mode & T2 && u5.recordLegacyContextWarning(X, $),
					u5.recordUnsafeLifecycleWarnings(X, $),
					($.state = X.memoizedState),
					(R = G.getDerivedStateFromProps),
					typeof R === 'function' && (iG(X, G, R, Z), ($.state = X.memoizedState)),
					typeof G.getDerivedStateFromProps === 'function' ||
						typeof $.getSnapshotBeforeUpdate === 'function' ||
						(typeof $.UNSAFE_componentWillMount !== 'function' &&
							typeof $.componentWillMount !== 'function') ||
						((R = $.state),
						typeof $.componentWillMount === 'function' && $.componentWillMount(),
						typeof $.UNSAFE_componentWillMount === 'function' && $.UNSAFE_componentWillMount(),
						R !== $.state &&
							(console.error(
								"%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
								v(X) || 'Component',
							),
							lZ.enqueueReplaceState($, $.state, null)),
						R3(X, Z, $, Y),
						$3(),
						($.state = X.memoizedState)),
					typeof $.componentDidMount === 'function' && (X.flags |= 4194308),
					(X.mode & f5) !== p && (X.flags |= 134217728),
					($ = !0));
			} else if (B === null) {
				$ = X.stateNode;
				var w = X.memoizedProps;
				((z = R1(G, w)), ($.props = z));
				var K = $.context;
				((H = G.contextType),
					(R = AB),
					typeof H === 'object' && H !== null && (R = d0(H)),
					(J = G.getDerivedStateFromProps),
					(H = typeof J === 'function' || typeof $.getSnapshotBeforeUpdate === 'function'),
					(w = X.pendingProps !== w),
					H ||
						(typeof $.UNSAFE_componentWillReceiveProps !== 'function' &&
							typeof $.componentWillReceiveProps !== 'function') ||
						((w || K !== R) && WR(X, $, Z, R)),
					(IB = !1));
				var M = X.memoizedState;
				(($.state = M),
					R3(X, Z, $, Y),
					$3(),
					(K = X.memoizedState),
					w || M !== K || IB
						? (typeof J === 'function' && (iG(X, G, J, Z), (K = X.memoizedState)),
							(z = IB || qR(X, G, z, Z, M, K, R))
								? (H ||
										(typeof $.UNSAFE_componentWillMount !== 'function' &&
											typeof $.componentWillMount !== 'function') ||
										(typeof $.componentWillMount === 'function' && $.componentWillMount(),
										typeof $.UNSAFE_componentWillMount === 'function' &&
											$.UNSAFE_componentWillMount()),
									typeof $.componentDidMount === 'function' && (X.flags |= 4194308),
									(X.mode & f5) !== p && (X.flags |= 134217728))
								: (typeof $.componentDidMount === 'function' && (X.flags |= 4194308),
									(X.mode & f5) !== p && (X.flags |= 134217728),
									(X.memoizedProps = Z),
									(X.memoizedState = K)),
							($.props = Z),
							($.state = K),
							($.context = R),
							($ = z))
						: (typeof $.componentDidMount === 'function' && (X.flags |= 4194308),
							(X.mode & f5) !== p && (X.flags |= 134217728),
							($ = !1)));
			} else {
				(($ = X.stateNode),
					LG(B, X),
					(R = X.memoizedProps),
					(H = R1(G, R)),
					($.props = H),
					(J = X.pendingProps),
					(M = $.context),
					(K = G.contextType),
					(z = AB),
					typeof K === 'object' && K !== null && (z = d0(K)),
					(w = G.getDerivedStateFromProps),
					(K = typeof w === 'function' || typeof $.getSnapshotBeforeUpdate === 'function') ||
						(typeof $.UNSAFE_componentWillReceiveProps !== 'function' &&
							typeof $.componentWillReceiveProps !== 'function') ||
						((R !== J || M !== z) && WR(X, $, Z, z)),
					(IB = !1),
					(M = X.memoizedState),
					($.state = M),
					R3(X, Z, $, Y),
					$3());
				var _ = X.memoizedState;
				R !== J || M !== _ || IB || (B !== null && B.dependencies !== null && h4(B.dependencies))
					? (typeof w === 'function' && (iG(X, G, w, Z), (_ = X.memoizedState)),
						(H =
							IB ||
							qR(X, G, H, Z, M, _, z) ||
							(B !== null && B.dependencies !== null && h4(B.dependencies)))
							? (K ||
									(typeof $.UNSAFE_componentWillUpdate !== 'function' &&
										typeof $.componentWillUpdate !== 'function') ||
									(typeof $.componentWillUpdate === 'function' && $.componentWillUpdate(Z, _, z),
									typeof $.UNSAFE_componentWillUpdate === 'function' &&
										$.UNSAFE_componentWillUpdate(Z, _, z)),
								typeof $.componentDidUpdate === 'function' && (X.flags |= 4),
								typeof $.getSnapshotBeforeUpdate === 'function' && (X.flags |= 1024))
							: (typeof $.componentDidUpdate !== 'function' ||
									(R === B.memoizedProps && M === B.memoizedState) ||
									(X.flags |= 4),
								typeof $.getSnapshotBeforeUpdate !== 'function' ||
									(R === B.memoizedProps && M === B.memoizedState) ||
									(X.flags |= 1024),
								(X.memoizedProps = Z),
								(X.memoizedState = _)),
						($.props = Z),
						($.state = _),
						($.context = z),
						($ = H))
					: (typeof $.componentDidUpdate !== 'function' ||
							(R === B.memoizedProps && M === B.memoizedState) ||
							(X.flags |= 4),
						typeof $.getSnapshotBeforeUpdate !== 'function' ||
							(R === B.memoizedProps && M === B.memoizedState) ||
							(X.flags |= 1024),
						($ = !1));
			}
			if (((z = $), q7(B, X), (R = (X.flags & 128) !== 0), z || R)) {
				if (((z = X.stateNode), k1(X), R && typeof G.getDerivedStateFromError !== 'function'))
					((G = null), (y2 = -1));
				else if (((G = CJ(z)), X.mode & T2)) {
					g0(!0);
					try {
						CJ(z);
					} finally {
						g0(!1);
					}
				}
				((X.flags |= 1),
					B !== null && R
						? ((X.child = L1(X, B.child, null, Y)), (X.child = L1(X, null, G, Y)))
						: P2(B, X, G, Y),
					(X.memoizedState = z.state),
					(B = X.child));
			} else B = T6(B, X, Y);
			return (
				(Y = X.stateNode),
				$ &&
					Y.props !== Z &&
					(DX ||
						console.error(
							'It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.',
							v(X) || 'a component',
						),
					(DX = !0)),
				B
			);
		}
		function IR(B, X, G, Z) {
			return (B1(), (X.flags |= 256), P2(B, X, G, Z), X.child);
		}
		function X8(B, X) {
			(X &&
				X.childContextTypes &&
				console.error(
					`childContextTypes cannot be defined on a function component.
  %s.childContextTypes = ...`,
					X.displayName || X.name || 'Component',
				),
				typeof X.getDerivedStateFromProps === 'function' &&
					((B = J0(X) || 'Unknown'),
					qU[B] ||
						(console.error('%s: Function components do not support getDerivedStateFromProps.', B),
						(qU[B] = !0))),
				typeof X.contextType === 'object' &&
					X.contextType !== null &&
					((X = J0(X) || 'Unknown'),
					QU[X] ||
						(console.error('%s: Function components do not support contextType.', X),
						(QU[X] = !0))));
		}
		function G8(B) {
			return { baseLanes: B, cachePool: N$() };
		}
		function Z8(B, X, G) {
			return ((B = B !== null ? B.childLanes & ~G : 0), X && (B |= o2), B);
		}
		function VR(B, X, G) {
			var Z,
				Y = X.pendingProps;
			h0(X) && (X.flags |= 128);
			var $ = !1,
				R = (X.flags & 128) !== 0;
			if (
				((Z = R) || (Z = B !== null && B.memoizedState === null ? !1 : (e0.current & B4) !== 0),
				Z && (($ = !0), (X.flags &= -129)),
				(Z = (X.flags & 32) !== 0),
				(X.flags &= -33),
				B === null)
			) {
				if (H0) {
					if (
						($ ? zB(X) : HB(X),
						(B = f0)
							? ((G = nz(B, I5)),
								(G = G !== null && G.data !== I1 ? G : null),
								G !== null &&
									((Z = {
										dehydrated: G,
										treeContext: K$(),
										retryLane: 536870912,
										hydrationErrors: null,
									}),
									(X.memoizedState = Z),
									(Z = W$(G)),
									(Z.return = X),
									(X.child = Z),
									(E2 = X),
									(f0 = null)))
							: (G = null),
						G === null)
					)
						throw (f4(X, B), GB(X));
					return (b8(G) ? (X.lanes = 32) : (X.lanes = 536870912), null);
				}
				var z = Y.children;
				if (((Y = Y.fallback), $)) {
					HB(X);
					var H = X.mode;
					return (
						(z = W7({ mode: 'hidden', children: z }, H)),
						(Y = rB(Y, H, G, null)),
						(z.return = X),
						(Y.return = X),
						(z.sibling = Y),
						(X.child = z),
						(Y = X.child),
						(Y.memoizedState = G8(G)),
						(Y.childLanes = Z8(B, Z, G)),
						(X.memoizedState = aZ),
						U3(null, Y)
					);
				}
				return (zB(X), Y8(X, z));
			}
			var J = B.memoizedState;
			if (J !== null) {
				var w = J.dehydrated;
				if (w !== null) {
					if (R)
						X.flags & 256
							? (zB(X), (X.flags &= -257), (X = $8(B, X, G)))
							: X.memoizedState !== null
								? (HB(X), (X.child = B.child), (X.flags |= 128), (X = null))
								: (HB(X),
									(z = Y.fallback),
									(H = X.mode),
									(Y = W7({ mode: 'visible', children: Y.children }, H)),
									(z = rB(z, H, G, null)),
									(z.flags |= 2),
									(Y.return = X),
									(z.return = X),
									(Y.sibling = z),
									(X.child = Y),
									L1(X, B.child, null, G),
									(Y = X.child),
									(Y.memoizedState = G8(G)),
									(Y.childLanes = Z8(B, Z, G)),
									(X.memoizedState = aZ),
									(X = U3(null, Y)));
					else if ((zB(X), _$(), (G & 536870912) !== 0 && L7(X), b8(w))) {
						if (((Z = w.nextSibling && w.nextSibling.dataset), Z)) {
							z = Z.dgst;
							var K = Z.msg;
							H = Z.stck;
							var M = Z.cstck;
						}
						(($ = K),
							(Z = z),
							(Y = H),
							(w = M),
							(z = $),
							(H = w),
							(z = z
								? Error(z)
								: Error(
										'The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering.',
									)),
							(z.stack = Y || ''),
							(z.digest = Z),
							(Z = H === void 0 ? null : H),
							(Y = { value: z, source: null, stack: Z }),
							typeof Z === 'string' && EZ.set(z, Y),
							eX(Y),
							(X = $8(B, X, G)));
					} else if ((R2 || s1(B, X, G, !1), (Z = (G & B.childLanes) !== 0), R2 || Z)) {
						if (((Z = S0), Z !== null && ((Y = cB(Z, G)), Y !== 0 && Y !== J.retryLane)))
							throw ((J.retryLane = Y), C2(B, Y), n0(Z, B, Y), cZ);
						(k8(w) || A7(), (X = $8(B, X, G)));
					} else
						k8(w)
							? ((X.flags |= 192), (X.child = B.child), (X = null))
							: ((B = J.treeContext),
								(f0 = H5(w.nextSibling)),
								(E2 = X),
								(H0 = !0),
								(jB = null),
								(_6 = !1),
								(M5 = null),
								(I5 = !1),
								B !== null && O$(X, B),
								(X = Y8(X, Y.children)),
								(X.flags |= 4096));
					return X;
				}
			}
			if ($)
				return (
					HB(X),
					(z = Y.fallback),
					(H = X.mode),
					(M = B.child),
					(w = M.sibling),
					(Y = I6(M, { mode: 'hidden', children: Y.children })),
					(Y.subtreeFlags = M.subtreeFlags & 65011712),
					w !== null ? (z = I6(w, z)) : ((z = rB(z, H, G, null)), (z.flags |= 2)),
					(z.return = X),
					(Y.return = X),
					(Y.sibling = z),
					(X.child = Y),
					U3(null, Y),
					(Y = X.child),
					(z = B.child.memoizedState),
					z === null
						? (z = G8(G))
						: ((H = z.cachePool),
							H !== null
								? ((M = Z2._currentValue), (H = H.parent !== M ? { parent: M, pool: M } : H))
								: (H = N$()),
							(z = { baseLanes: z.baseLanes | G, cachePool: H })),
					(Y.memoizedState = z),
					(Y.childLanes = Z8(B, Z, G)),
					(X.memoizedState = aZ),
					U3(B.child, Y)
				);
			return (
				J !== null && (G & 62914560) === G && (G & B.lanes) !== 0 && L7(X),
				zB(X),
				(G = B.child),
				(B = G.sibling),
				(G = I6(G, { mode: 'visible', children: Y.children })),
				(G.return = X),
				(G.sibling = null),
				B !== null &&
					((Z = X.deletions), Z === null ? ((X.deletions = [B]), (X.flags |= 16)) : Z.push(B)),
				(X.child = G),
				(X.memoizedState = null),
				G
			);
		}
		function Y8(B, X) {
			return ((X = W7({ mode: 'visible', children: X }, B.mode)), (X.return = B), (B.child = X));
		}
		function W7(B, X) {
			return ((B = g(22, B, null, X)), (B.lanes = 0), B);
		}
		function $8(B, X, G) {
			return (
				L1(X, B.child, null, G),
				(B = Y8(X, X.pendingProps.children)),
				(B.flags |= 2),
				(X.memoizedState = null),
				B
			);
		}
		function CR(B, X, G) {
			B.lanes |= X;
			var Z = B.alternate;
			(Z !== null && (Z.lanes |= X), QG(B.return, X, G));
		}
		function R8(B, X, G, Z, Y, $) {
			var R = B.memoizedState;
			R === null
				? (B.memoizedState = {
						isBackwards: X,
						rendering: null,
						renderingStartTime: 0,
						last: Z,
						tail: G,
						tailMode: Y,
						treeForkCount: $,
					})
				: ((R.isBackwards = X),
					(R.rendering = null),
					(R.renderingStartTime = 0),
					(R.last = Z),
					(R.tail = G),
					(R.tailMode = Y),
					(R.treeForkCount = $));
		}
		function DR(B, X, G) {
			var Z = X.pendingProps,
				Y = Z.revealOrder,
				$ = Z.tail,
				R = Z.children,
				z = e0.current;
			if (
				((Z = (z & B4) !== 0) ? ((z = (z & EX) | B4), (X.flags |= 128)) : (z &= EX),
				z0(e0, z, X),
				(z = Y == null ? 'null' : Y),
				Y !== 'forwards' &&
					Y !== 'unstable_legacy-backwards' &&
					Y !== 'together' &&
					Y !== 'independent' &&
					!WU[z])
			)
				if (((WU[z] = !0), Y == null))
					console.error(
						'The default for the <SuspenseList revealOrder="..."> prop is changing. To be future compatible you must explictly specify either "independent" (the current default), "together", "forwards" or "legacy_unstable-backwards".',
					);
				else if (Y === 'backwards')
					console.error(
						'The rendering order of <SuspenseList revealOrder="backwards"> is changing. To be future compatible you must specify revealOrder="legacy_unstable-backwards" instead.',
					);
				else if (typeof Y === 'string')
					switch (Y.toLowerCase()) {
						case 'together':
						case 'forwards':
						case 'backwards':
						case 'independent':
							console.error(
								'"%s" is not a valid value for revealOrder on <SuspenseList />. Use lowercase "%s" instead.',
								Y,
								Y.toLowerCase(),
							);
							break;
						case 'forward':
						case 'backward':
							console.error(
								'"%s" is not a valid value for revealOrder on <SuspenseList />. React uses the -s suffix in the spelling. Use "%ss" instead.',
								Y,
								Y.toLowerCase(),
							);
							break;
						default:
							console.error(
								'"%s" is not a supported revealOrder on <SuspenseList />. Did you mean "independent", "together", "forwards" or "backwards"?',
								Y,
							);
					}
				else
					console.error(
						'%s is not a supported value for revealOrder on <SuspenseList />. Did you mean "independent", "together", "forwards" or "backwards"?',
						Y,
					);
			if (((z = $ == null ? 'null' : $), !M9[z]))
				if ($ == null) {
					if (Y === 'forwards' || Y === 'backwards' || Y === 'unstable_legacy-backwards')
						((M9[z] = !0),
							console.error(
								'The default for the <SuspenseList tail="..."> prop is changing. To be future compatible you must explictly specify either "visible" (the current default), "collapsed" or "hidden".',
							));
				} else
					$ !== 'visible' && $ !== 'collapsed' && $ !== 'hidden'
						? ((M9[z] = !0),
							console.error(
								'"%s" is not a supported value for tail on <SuspenseList />. Did you mean "visible", "collapsed" or "hidden"?',
								$,
							))
						: Y !== 'forwards' &&
							Y !== 'backwards' &&
							Y !== 'unstable_legacy-backwards' &&
							((M9[z] = !0),
							console.error(
								'<SuspenseList tail="%s" /> is only valid if revealOrder is "forwards" or "backwards". Did you mean to specify revealOrder="forwards"?',
								$,
							));
			B: if (
				(Y === 'forwards' || Y === 'backwards' || Y === 'unstable_legacy-backwards') &&
				R !== void 0 &&
				R !== null &&
				R !== !1
			)
				if (Q2(R)) {
					for (z = 0; z < R.length; z++) if (!k$(R[z], z)) break B;
				} else if (((z = U2(R)), typeof z === 'function')) {
					if ((z = z.call(R)))
						for (var H = z.next(), J = 0; !H.done; H = z.next()) {
							if (!k$(H.value, J)) break B;
							J++;
						}
				} else
					console.error(
						'A single row was passed to a <SuspenseList revealOrder="%s" />. This is not useful since it needs multiple rows. Did you mean to pass multiple children or an array?',
						Y,
					);
			if (
				(P2(B, X, R, G), H0 ? (XB(), (R = f3)) : (R = 0), !Z && B !== null && (B.flags & 128) !== 0)
			)
				B: for (B = X.child; B !== null;) {
					if (B.tag === 13) B.memoizedState !== null && CR(B, G, X);
					else if (B.tag === 19) CR(B, G, X);
					else if (B.child !== null) {
						((B.child.return = B), (B = B.child));
						continue;
					}
					if (B === X) break B;
					for (; B.sibling === null;) {
						if (B.return === null || B.return === X) break B;
						B = B.return;
					}
					((B.sibling.return = B.return), (B = B.sibling));
				}
			switch (Y) {
				case 'forwards':
					G = X.child;
					for (Y = null; G !== null;)
						((B = G.alternate), B !== null && r4(B) === null && (Y = G), (G = G.sibling));
					((G = Y),
						G === null ? ((Y = X.child), (X.child = null)) : ((Y = G.sibling), (G.sibling = null)),
						R8(X, !1, Y, G, $, R));
					break;
				case 'backwards':
				case 'unstable_legacy-backwards':
					((G = null), (Y = X.child));
					for (X.child = null; Y !== null;) {
						if (((B = Y.alternate), B !== null && r4(B) === null)) {
							X.child = Y;
							break;
						}
						((B = Y.sibling), (Y.sibling = G), (G = Y), (Y = B));
					}
					R8(X, !0, G, null, $, R);
					break;
				case 'together':
					R8(X, !1, null, null, void 0, R);
					break;
				default:
					X.memoizedState = null;
			}
			return X.child;
		}
		function T6(B, X, G) {
			if (
				(B !== null && (X.dependencies = B.dependencies),
				(y2 = -1),
				(DB |= X.lanes),
				(G & X.childLanes) === 0)
			)
				if (B !== null) {
					if ((s1(B, X, G, !1), (G & X.childLanes) === 0)) return null;
				} else return null;
			if (B !== null && X.child !== B.child) throw Error('Resuming work not yet implemented.');
			if (X.child !== null) {
				((B = X.child), (G = I6(B, B.pendingProps)), (X.child = G));
				for (G.return = X; B.sibling !== null;)
					((B = B.sibling), (G = G.sibling = I6(B, B.pendingProps)), (G.return = X));
				G.sibling = null;
			}
			return X.child;
		}
		function z8(B, X) {
			if ((B.lanes & X) !== 0) return !0;
			return ((B = B.dependencies), B !== null && h4(B) ? !0 : !1);
		}
		function YM(B, X, G) {
			switch (X.tag) {
				case 3:
					(T(X, X.stateNode.containerInfo), ZB(X, Z2, B.memoizedState.cache), B1());
					break;
				case 27:
				case 5:
					A0(X);
					break;
				case 4:
					T(X, X.stateNode.containerInfo);
					break;
				case 10:
					ZB(X, X.type, X.memoizedProps.value);
					break;
				case 12:
					((G & X.childLanes) !== 0 && (X.flags |= 4), (X.flags |= 2048));
					var Z = X.stateNode;
					((Z.effectDuration = -0), (Z.passiveEffectDuration = -0));
					break;
				case 31:
					if (X.memoizedState !== null) return ((X.flags |= 128), FG(X), null);
					break;
				case 13:
					if (((Z = X.memoizedState), Z !== null)) {
						if (Z.dehydrated !== null) return (zB(X), (X.flags |= 128), null);
						if ((G & X.child.childLanes) !== 0) return VR(B, X, G);
						return (zB(X), (B = T6(B, X, G)), B !== null ? B.sibling : null);
					}
					zB(X);
					break;
				case 19:
					var Y = (B.flags & 128) !== 0;
					if (
						((Z = (G & X.childLanes) !== 0),
						Z || (s1(B, X, G, !1), (Z = (G & X.childLanes) !== 0)),
						Y)
					) {
						if (Z) return DR(B, X, G);
						X.flags |= 128;
					}
					if (
						((Y = X.memoizedState),
						Y !== null && ((Y.rendering = null), (Y.tail = null), (Y.lastEffect = null)),
						z0(e0, e0.current, X),
						Z)
					)
						break;
					else return null;
				case 22:
					return ((X.lanes = 0), FR(B, X, G, X.pendingProps));
				case 24:
					ZB(X, Z2, B.memoizedState.cache);
			}
			return T6(B, X, G);
		}
		function H8(B, X, G) {
			if (X._debugNeedsRemount && B !== null) {
				((G = YG(X.type, X.key, X.pendingProps, X._debugOwner || null, X.mode, X.lanes)),
					(G._debugStack = X._debugStack),
					(G._debugTask = X._debugTask));
				var Z = X.return;
				if (Z === null) throw Error('Cannot swap the root fiber.');
				if (
					((B.alternate = null),
					(X.alternate = null),
					(G.index = X.index),
					(G.sibling = X.sibling),
					(G.return = X.return),
					(G.ref = X.ref),
					(G._debugInfo = X._debugInfo),
					X === Z.child)
				)
					Z.child = G;
				else {
					var Y = Z.child;
					if (Y === null) throw Error('Expected parent to have a child.');
					for (; Y.sibling !== X;)
						if (((Y = Y.sibling), Y === null))
							throw Error('Expected to find the previous sibling.');
					Y.sibling = G;
				}
				return (
					(X = Z.deletions),
					X === null ? ((Z.deletions = [B]), (Z.flags |= 16)) : X.push(B),
					(G.flags |= 2),
					G
				);
			}
			if (B !== null)
				if (B.memoizedProps !== X.pendingProps || X.type !== B.type) R2 = !0;
				else {
					if (!z8(B, G) && (X.flags & 128) === 0) return ((R2 = !1), YM(B, X, G));
					R2 = (B.flags & 131072) !== 0 ? !0 : !1;
				}
			else {
				if (((R2 = !1), (Z = H0))) (XB(), (Z = (X.flags & 1048576) !== 0));
				Z && ((Z = X.index), XB(), w$(X, f3, Z));
			}
			switch (((X.lanes = 0), X.tag)) {
				case 16:
					B: if (
						((Z = X.pendingProps), (B = YB(X.elementType)), (X.type = B), typeof B === 'function')
					)
						ZG(B)
							? ((Z = R1(B, Z)), (X.tag = 1), (X.type = B = tB(B)), (X = ER(null, X, B, Z, G)))
							: ((X.tag = 0), X8(X, B), (X.type = B = tB(B)), (X = B8(null, X, B, Z, G)));
					else {
						if (B !== void 0 && B !== null) {
							if (((Y = B.$$typeof), Y === E3)) {
								((X.tag = 11), (X.type = B = GG(B)), (X = LR(null, X, B, Z, G)));
								break B;
							} else if (Y === g7) {
								((X.tag = 14), (X = AR(null, X, B, Z, G)));
								break B;
							}
						}
						throw (
							(X = ''),
							B !== null &&
								typeof B === 'object' &&
								B.$$typeof === J5 &&
								(X = ' Did you wrap a component in React.lazy() more than once?'),
							(G = J0(B) || B),
							Error(
								'Element type is invalid. Received a promise that resolves to: ' +
									G +
									'. Lazy element type must resolve to a class or function.' +
									X,
							)
						);
					}
					return X;
				case 0:
					return B8(B, X, X.type, X.pendingProps, G);
				case 1:
					return ((Z = X.type), (Y = R1(Z, X.pendingProps)), ER(B, X, Z, Y, G));
				case 3:
					B: {
						if ((T(X, X.stateNode.containerInfo), B === null))
							throw Error('Should have a current fiber. This is a bug in React.');
						Z = X.pendingProps;
						var $ = X.memoizedState;
						((Y = $.element), LG(B, X), R3(X, Z, null, G));
						var R = X.memoizedState;
						if (
							((Z = R.cache),
							ZB(X, Z2, Z),
							Z !== $.cache && MG(X, [Z2], G, !0),
							$3(),
							(Z = R.element),
							$.isDehydrated)
						)
							if (
								(($ = { element: Z, isDehydrated: !1, cache: R.cache }),
								(X.updateQueue.baseState = $),
								(X.memoizedState = $),
								X.flags & 256)
							) {
								X = IR(B, X, Z, G);
								break B;
							} else if (Z !== Y) {
								((Y = Z5(
									Error(
										'This root received an early update, before anything was able hydrate. Switched the entire root to client rendering.',
									),
									X,
								)),
									eX(Y),
									(X = IR(B, X, Z, G)));
								break B;
							} else {
								switch (((B = X.stateNode.containerInfo), B.nodeType)) {
									case 9:
										B = B.body;
										break;
									default:
										B = B.nodeName === 'HTML' ? B.ownerDocument.body : B;
								}
								((f0 = H5(B.firstChild)),
									(E2 = X),
									(H0 = !0),
									(jB = null),
									(_6 = !1),
									(M5 = null),
									(I5 = !0),
									(G = sJ(X, null, Z, G)));
								for (X.child = G; G;) ((G.flags = (G.flags & -3) | 4096), (G = G.sibling));
							}
						else {
							if ((B1(), Z === Y)) {
								X = T6(B, X, G);
								break B;
							}
							P2(B, X, Z, G);
						}
						X = X.child;
					}
					return X;
				case 26:
					return (
						q7(B, X),
						B === null
							? (G = XH(X.type, null, X.pendingProps, null))
								? (X.memoizedState = G)
								: H0 ||
									((G = X.type),
									(B = X.pendingProps),
									(Z = j2(WB.current)),
									(Z = x7(Z).createElement(G)),
									(Z[N2] = X),
									(Z[k2] = B),
									x2(Z, G, B),
									f(Z),
									(X.stateNode = Z))
							: (X.memoizedState = XH(X.type, B.memoizedProps, X.pendingProps, B.memoizedState)),
						null
					);
				case 27:
					return (
						A0(X),
						B === null &&
							H0 &&
							((Z = j2(WB.current)),
							(Y = d()),
							(Z = X.stateNode = ez(X.type, X.pendingProps, Z, Y, !1)),
							_6 ||
								((Y = hz(Z, X.type, X.pendingProps, Y)), Y !== null && (eB(X, 0).serverProps = Y)),
							(E2 = X),
							(I5 = !0),
							(Y = f0),
							MB(X.type) ? ((KY = Y), (f0 = H5(Z.firstChild))) : (f0 = Y)),
						P2(B, X, X.pendingProps.children, G),
						q7(B, X),
						B === null && (X.flags |= 4194304),
						X.child
					);
				case 5:
					return (
						B === null &&
							H0 &&
							(($ = d()),
							(Z = o9(X.type, $.ancestorInfo)),
							(Y = f0),
							(R = !Y) ||
								((R = cM(Y, X.type, X.pendingProps, I5)),
								R !== null
									? ((X.stateNode = R),
										_6 ||
											(($ = hz(R, X.type, X.pendingProps, $)),
											$ !== null && (eB(X, 0).serverProps = $)),
										(E2 = X),
										(f0 = H5(R.firstChild)),
										(I5 = !1),
										($ = !0))
									: ($ = !1),
								(R = !$)),
							R && (Z && f4(X, Y), GB(X))),
						A0(X),
						(Y = X.type),
						($ = X.pendingProps),
						(R = B !== null ? B.memoizedProps : null),
						(Z = $.children),
						S8(Y, $) ? (Z = null) : R !== null && S8(Y, R) && (X.flags |= 32),
						X.memoizedState !== null && ((Y = xG(B, X, iQ, null, null, G)), (_4._currentValue = Y)),
						q7(B, X),
						P2(B, X, Z, G),
						X.child
					);
				case 6:
					return (
						B === null &&
							H0 &&
							((G = X.pendingProps),
							(B = d()),
							(Z = B.ancestorInfo.current),
							(G = Z != null ? C4(G, Z.tag, B.ancestorInfo.implicitRootScope) : !0),
							(B = f0),
							(Z = !B) ||
								((Z = aM(B, X.pendingProps, I5)),
								Z !== null ? ((X.stateNode = Z), (E2 = X), (f0 = null), (Z = !0)) : (Z = !1),
								(Z = !Z)),
							Z && (G && f4(X, B), GB(X))),
						null
					);
				case 13:
					return VR(B, X, G);
				case 4:
					return (
						T(X, X.stateNode.containerInfo),
						(Z = X.pendingProps),
						B === null ? (X.child = L1(X, null, Z, G)) : P2(B, X, Z, G),
						X.child
					);
				case 11:
					return LR(B, X, X.type, X.pendingProps, G);
				case 7:
					return (P2(B, X, X.pendingProps, G), X.child);
				case 8:
					return (P2(B, X, X.pendingProps.children, G), X.child);
				case 12:
					return (
						(X.flags |= 4),
						(X.flags |= 2048),
						(Z = X.stateNode),
						(Z.effectDuration = -0),
						(Z.passiveEffectDuration = -0),
						P2(B, X, X.pendingProps.children, G),
						X.child
					);
				case 10:
					return (
						(Z = X.type),
						(Y = X.pendingProps),
						($ = Y.value),
						'value' in Y ||
							wU ||
							((wU = !0),
							console.error(
								'The `value` prop is required for the `<Context.Provider>`. Did you misspell it or forget to pass it?',
							)),
						ZB(X, Z, $),
						P2(B, X, Y.children, G),
						X.child
					);
				case 9:
					return (
						(Y = X.type._context),
						(Z = X.pendingProps.children),
						typeof Z !== 'function' &&
							console.error(
								"A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it.",
							),
						X1(X),
						(Y = d0(Y)),
						(Z = gZ(Z, Y, void 0)),
						(X.flags |= 1),
						P2(B, X, Z, G),
						X.child
					);
				case 14:
					return AR(B, X, X.type, X.pendingProps, G);
				case 15:
					return jR(B, X, X.type, X.pendingProps, G);
				case 19:
					return DR(B, X, G);
				case 31:
					return ZM(B, X, G);
				case 22:
					return FR(B, X, G, X.pendingProps);
				case 24:
					return (
						X1(X),
						(Z = d0(Z2)),
						B === null
							? ((Y = KG()),
								Y === null &&
									((Y = S0),
									($ = qG()),
									(Y.pooledCache = $),
									G1($),
									$ !== null && (Y.pooledCacheLanes |= G),
									(Y = $)),
								(X.memoizedState = { parent: Z, cache: Y }),
								_G(X),
								ZB(X, Z2, Y))
							: ((B.lanes & G) !== 0 && (LG(B, X), R3(X, null, null, G), $3()),
								(Y = B.memoizedState),
								($ = X.memoizedState),
								Y.parent !== Z
									? ((Y = { parent: Z, cache: Z }),
										(X.memoizedState = Y),
										X.lanes === 0 && (X.memoizedState = X.updateQueue.baseState = Y),
										ZB(X, Z2, Z))
									: ((Z = $.cache), ZB(X, Z2, Z), Z !== Y.cache && MG(X, [Z2], G, !0))),
						P2(B, X, X.pendingProps.children, G),
						X.child
					);
				case 29:
					throw X.pendingProps;
			}
			throw Error(
				'Unknown unit of work tag (' +
					X.tag +
					'). This error is likely caused by a bug in React. Please file an issue.',
			);
		}
		function v6(B) {
			B.flags |= 4;
		}
		function J8(B, X, G, Z, Y) {
			if ((X = (B.mode & xW) !== p)) X = !1;
			if (X) {
				if (((B.flags |= 16777216), (Y & 335544128) === Y))
					if (B.stateNode.complete) B.flags |= 8192;
					else if (Jz()) B.flags |= 8192;
					else throw ((_1 = R9), bZ);
			} else B.flags &= -16777217;
		}
		function TR(B, X) {
			if (X.type !== 'stylesheet' || (X.state.loading & v5) !== D1) B.flags &= -16777217;
			else if (((B.flags |= 16777216), !RH(X)))
				if (Jz()) B.flags |= 8192;
				else throw ((_1 = R9), bZ);
		}
		function w7(B, X) {
			(X !== null && (B.flags |= 4),
				B.flags & 16384 && ((X = B.tag !== 22 ? m1() : 536870912), (B.lanes |= X), (x1 |= X)));
		}
		function Q3(B, X) {
			if (!H0)
				switch (B.tailMode) {
					case 'hidden':
						X = B.tail;
						for (var G = null; X !== null;) (X.alternate !== null && (G = X), (X = X.sibling));
						G === null ? (B.tail = null) : (G.sibling = null);
						break;
					case 'collapsed':
						G = B.tail;
						for (var Z = null; G !== null;) (G.alternate !== null && (Z = G), (G = G.sibling));
						Z === null
							? X || B.tail === null
								? (B.tail = null)
								: (B.tail.sibling = null)
							: (Z.sibling = null);
				}
		}
		function k0(B) {
			var X = B.alternate !== null && B.alternate.child === B.child,
				G = 0,
				Z = 0;
			if (X)
				if ((B.mode & e) !== p) {
					for (var { selfBaseDuration: Y, child: $ } = B; $ !== null;)
						((G |= $.lanes | $.childLanes),
							(Z |= $.subtreeFlags & 65011712),
							(Z |= $.flags & 65011712),
							(Y += $.treeBaseDuration),
							($ = $.sibling));
					B.treeBaseDuration = Y;
				} else
					for (Y = B.child; Y !== null;)
						((G |= Y.lanes | Y.childLanes),
							(Z |= Y.subtreeFlags & 65011712),
							(Z |= Y.flags & 65011712),
							(Y.return = B),
							(Y = Y.sibling));
			else if ((B.mode & e) !== p) {
				((Y = B.actualDuration), ($ = B.selfBaseDuration));
				for (var R = B.child; R !== null;)
					((G |= R.lanes | R.childLanes),
						(Z |= R.subtreeFlags),
						(Z |= R.flags),
						(Y += R.actualDuration),
						($ += R.treeBaseDuration),
						(R = R.sibling));
				((B.actualDuration = Y), (B.treeBaseDuration = $));
			} else
				for (Y = B.child; Y !== null;)
					((G |= Y.lanes | Y.childLanes),
						(Z |= Y.subtreeFlags),
						(Z |= Y.flags),
						(Y.return = B),
						(Y = Y.sibling));
			return ((B.subtreeFlags |= Z), (B.childLanes = G), X);
		}
		function $M(B, X, G) {
			var Z = X.pendingProps;
			switch ((HG(X), X.tag)) {
				case 16:
				case 15:
				case 0:
				case 11:
				case 7:
				case 8:
				case 12:
				case 9:
				case 14:
					return (k0(X), null);
				case 1:
					return (k0(X), null);
				case 3:
					if (
						((G = X.stateNode),
						(Z = null),
						B !== null && (Z = B.memoizedState.cache),
						X.memoizedState.cache !== Z && (X.flags |= 2048),
						C6(Z2, X),
						l(X),
						G.pendingContext && ((G.context = G.pendingContext), (G.pendingContext = null)),
						B === null || B.child === null)
					)
						d1(X)
							? (UG(), v6(X))
							: B === null ||
								(B.memoizedState.isDehydrated && (X.flags & 256) === 0) ||
								((X.flags |= 1024), JG());
					return (k0(X), null);
				case 26:
					var { type: Y, memoizedState: $ } = X;
					return (
						B === null
							? (v6(X), $ !== null ? (k0(X), TR(X, $)) : (k0(X), J8(X, Y, null, Z, G)))
							: $
								? $ !== B.memoizedState
									? (v6(X), k0(X), TR(X, $))
									: (k0(X), (X.flags &= -16777217))
								: ((B = B.memoizedProps), B !== Z && v6(X), k0(X), J8(X, Y, B, Z, G)),
						null
					);
				case 27:
					if ((j0(X), (G = j2(WB.current)), (Y = X.type), B !== null && X.stateNode != null))
						B.memoizedProps !== Z && v6(X);
					else {
						if (!Z) {
							if (X.stateNode === null)
								throw Error(
									'We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.',
								);
							return (k0(X), null);
						}
						((B = d()), d1(X) ? L$(X, B) : ((B = ez(Y, Z, G, B, !0)), (X.stateNode = B), v6(X)));
					}
					return (k0(X), null);
				case 5:
					if ((j0(X), (Y = X.type), B !== null && X.stateNode != null))
						B.memoizedProps !== Z && v6(X);
					else {
						if (!Z) {
							if (X.stateNode === null)
								throw Error(
									'We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.',
								);
							return (k0(X), null);
						}
						var R = d();
						if (d1(X)) L$(X, R);
						else {
							switch (
								(($ = j2(WB.current)), o9(Y, R.ancestorInfo), (R = R.context), ($ = x7($)), R)
							) {
								case yX:
									$ = $.createElementNS(HX, Y);
									break;
								case v9:
									$ = $.createElementNS(h7, Y);
									break;
								default:
									switch (Y) {
										case 'svg':
											$ = $.createElementNS(HX, Y);
											break;
										case 'math':
											$ = $.createElementNS(h7, Y);
											break;
										case 'script':
											(($ = $.createElement('div')),
												($.innerHTML = '<script></script>'),
												($ = $.removeChild($.firstChild)));
											break;
										case 'select':
											(($ =
												typeof Z.is === 'string'
													? $.createElement('select', { is: Z.is })
													: $.createElement('select')),
												Z.multiple ? ($.multiple = !0) : Z.size && ($.size = Z.size));
											break;
										default:
											(($ =
												typeof Z.is === 'string'
													? $.createElement(Y, { is: Z.is })
													: $.createElement(Y)),
												Y.indexOf('-') === -1 &&
													(Y !== Y.toLowerCase() &&
														console.error(
															'<%s /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.',
															Y,
														),
													Object.prototype.toString.call($) !== '[object HTMLUnknownElement]' ||
														m5.call(fU, Y) ||
														((fU[Y] = !0),
														console.error(
															'The tag <%s> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.',
															Y,
														))));
									}
							}
							(($[N2] = X), ($[k2] = Z));
							B: for (R = X.child; R !== null;) {
								if (R.tag === 5 || R.tag === 6) $.appendChild(R.stateNode);
								else if (R.tag !== 4 && R.tag !== 27 && R.child !== null) {
									((R.child.return = R), (R = R.child));
									continue;
								}
								if (R === X) break B;
								for (; R.sibling === null;) {
									if (R.return === null || R.return === X) break B;
									R = R.return;
								}
								((R.sibling.return = R.return), (R = R.sibling));
							}
							X.stateNode = $;
							B: switch ((x2($, Y, Z), Y)) {
								case 'button':
								case 'input':
								case 'select':
								case 'textarea':
									Z = !!Z.autoFocus;
									break B;
								case 'img':
									Z = !0;
									break B;
								default:
									Z = !1;
							}
							Z && v6(X);
						}
					}
					return (
						k0(X),
						J8(X, X.type, B === null ? null : B.memoizedProps, X.pendingProps, G),
						null
					);
				case 6:
					if (B && X.stateNode != null) B.memoizedProps !== Z && v6(X);
					else {
						if (typeof Z !== 'string' && X.stateNode === null)
							throw Error(
								'We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.',
							);
						if (((B = j2(WB.current)), (G = d()), d1(X))) {
							if (
								((B = X.stateNode),
								(G = X.memoizedProps),
								(Y = !_6),
								(Z = null),
								($ = E2),
								$ !== null)
							)
								switch ($.tag) {
									case 3:
										Y && ((Y = tz(B, G, Z)), Y !== null && (eB(X, 0).serverProps = Y));
										break;
									case 27:
									case 5:
										((Z = $.memoizedProps),
											Y && ((Y = tz(B, G, Z)), Y !== null && (eB(X, 0).serverProps = Y)));
								}
							((B[N2] = X),
								(B =
									B.nodeValue === G ||
									(Z !== null && Z.suppressHydrationWarning === !0) ||
									bz(B.nodeValue, G)
										? !0
										: !1),
								B || GB(X, !0));
						} else
							((Y = G.ancestorInfo.current),
								Y != null && C4(Z, Y.tag, G.ancestorInfo.implicitRootScope),
								(B = x7(B).createTextNode(Z)),
								(B[N2] = X),
								(X.stateNode = B));
					}
					return (k0(X), null);
				case 31:
					if (((G = X.memoizedState), B === null || B.memoizedState !== null)) {
						if (((Z = d1(X)), G !== null)) {
							if (B === null) {
								if (!Z)
									throw Error(
										'A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.',
									);
								if (((B = X.memoizedState), (B = B !== null ? B.dehydrated : null), !B))
									throw Error(
										'Expected to have a hydrated activity instance. This error is likely caused by a bug in React. Please file an issue.',
									);
								((B[N2] = X),
									k0(X),
									(X.mode & e) !== p &&
										G !== null &&
										((B = X.child), B !== null && (X.treeBaseDuration -= B.treeBaseDuration)));
							} else
								(UG(),
									B1(),
									(X.flags & 128) === 0 && (G = X.memoizedState = null),
									(X.flags |= 4),
									k0(X),
									(X.mode & e) !== p &&
										G !== null &&
										((B = X.child), B !== null && (X.treeBaseDuration -= B.treeBaseDuration)));
							B = !1;
						} else
							((G = JG()),
								B !== null && B.memoizedState !== null && (B.memoizedState.hydrationErrors = G),
								(B = !0));
						if (!B) {
							if (X.flags & 256) return (R5(X), X);
							return (R5(X), null);
						}
						if ((X.flags & 128) !== 0)
							throw Error(
								'Client rendering an Activity suspended it again. This is a bug in React.',
							);
					}
					return (k0(X), null);
				case 13:
					if (
						((Z = X.memoizedState),
						B === null || (B.memoizedState !== null && B.memoizedState.dehydrated !== null))
					) {
						if (((Y = Z), ($ = d1(X)), Y !== null && Y.dehydrated !== null)) {
							if (B === null) {
								if (!$)
									throw Error(
										'A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.',
									);
								if ((($ = X.memoizedState), ($ = $ !== null ? $.dehydrated : null), !$))
									throw Error(
										'Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.',
									);
								(($[N2] = X),
									k0(X),
									(X.mode & e) !== p &&
										Y !== null &&
										((Y = X.child), Y !== null && (X.treeBaseDuration -= Y.treeBaseDuration)));
							} else
								(UG(),
									B1(),
									(X.flags & 128) === 0 && (Y = X.memoizedState = null),
									(X.flags |= 4),
									k0(X),
									(X.mode & e) !== p &&
										Y !== null &&
										((Y = X.child), Y !== null && (X.treeBaseDuration -= Y.treeBaseDuration)));
							Y = !1;
						} else
							((Y = JG()),
								B !== null && B.memoizedState !== null && (B.memoizedState.hydrationErrors = Y),
								(Y = !0));
						if (!Y) {
							if (X.flags & 256) return (R5(X), X);
							return (R5(X), null);
						}
					}
					if ((R5(X), (X.flags & 128) !== 0))
						return ((X.lanes = G), (X.mode & e) !== p && G3(X), X);
					return (
						(G = Z !== null),
						(B = B !== null && B.memoizedState !== null),
						G &&
							((Z = X.child),
							(Y = null),
							Z.alternate !== null &&
								Z.alternate.memoizedState !== null &&
								Z.alternate.memoizedState.cachePool !== null &&
								(Y = Z.alternate.memoizedState.cachePool.pool),
							($ = null),
							Z.memoizedState !== null &&
								Z.memoizedState.cachePool !== null &&
								($ = Z.memoizedState.cachePool.pool),
							$ !== Y && (Z.flags |= 2048)),
						G !== B && G && (X.child.flags |= 8192),
						w7(X, X.updateQueue),
						k0(X),
						(X.mode & e) !== p &&
							G &&
							((B = X.child), B !== null && (X.treeBaseDuration -= B.treeBaseDuration)),
						null
					);
				case 4:
					return (l(X), B === null && E8(X.stateNode.containerInfo), k0(X), null);
				case 10:
					return (C6(X.type, X), k0(X), null);
				case 19:
					if ((K0(e0, X), (Z = X.memoizedState), Z === null)) return (k0(X), null);
					if (((Y = (X.flags & 128) !== 0), ($ = Z.rendering), $ === null))
						if (Y) Q3(Z, !1);
						else {
							if (a0 !== a6 || (B !== null && (B.flags & 128) !== 0))
								for (B = X.child; B !== null;) {
									if ((($ = r4(B)), $ !== null)) {
										((X.flags |= 128),
											Q3(Z, !1),
											(B = $.updateQueue),
											(X.updateQueue = B),
											w7(X, B),
											(X.subtreeFlags = 0),
											(B = G));
										for (G = X.child; G !== null;) (q$(G, B), (G = G.sibling));
										return (
											z0(e0, (e0.current & EX) | B4, X),
											H0 && V6(X, Z.treeForkCount),
											X.child
										);
									}
									B = B.sibling;
								}
							Z.tail !== null &&
								K2() > L9 &&
								((X.flags |= 128), (Y = !0), Q3(Z, !1), (X.lanes = 4194304));
						}
					else {
						if (!Y)
							if (((B = r4($)), B !== null)) {
								if (
									((X.flags |= 128),
									(Y = !0),
									(B = B.updateQueue),
									(X.updateQueue = B),
									w7(X, B),
									Q3(Z, !0),
									Z.tail === null && Z.tailMode === 'hidden' && !$.alternate && !H0)
								)
									return (k0(X), null);
							} else
								2 * K2() - Z.renderingStartTime > L9 &&
									G !== 536870912 &&
									((X.flags |= 128), (Y = !0), Q3(Z, !1), (X.lanes = 4194304));
						Z.isBackwards
							? (($.sibling = X.child), (X.child = $))
							: ((B = Z.last), B !== null ? (B.sibling = $) : (X.child = $), (Z.last = $));
					}
					if (Z.tail !== null)
						return (
							(B = Z.tail),
							(Z.rendering = B),
							(Z.tail = B.sibling),
							(Z.renderingStartTime = K2()),
							(B.sibling = null),
							(G = e0.current),
							(G = Y ? (G & EX) | B4 : G & EX),
							z0(e0, G, X),
							H0 && V6(X, Z.treeForkCount),
							B
						);
					return (k0(X), null);
				case 22:
				case 23:
					return (
						R5(X),
						jG(X),
						(Z = X.memoizedState !== null),
						B !== null
							? (B.memoizedState !== null) !== Z && (X.flags |= 8192)
							: Z && (X.flags |= 8192),
						Z
							? (G & 536870912) !== 0 &&
								(X.flags & 128) === 0 &&
								(k0(X), X.subtreeFlags & 6 && (X.flags |= 8192))
							: k0(X),
						(G = X.updateQueue),
						G !== null && w7(X, G.retryQueue),
						(G = null),
						B !== null &&
							B.memoizedState !== null &&
							B.memoizedState.cachePool !== null &&
							(G = B.memoizedState.cachePool.pool),
						(Z = null),
						X.memoizedState !== null &&
							X.memoizedState.cachePool !== null &&
							(Z = X.memoizedState.cachePool.pool),
						Z !== G && (X.flags |= 2048),
						B !== null && K0(K1, X),
						null
					);
				case 24:
					return (
						(G = null),
						B !== null && (G = B.memoizedState.cache),
						X.memoizedState.cache !== G && (X.flags |= 2048),
						C6(Z2, X),
						k0(X),
						null
					);
				case 25:
					return null;
				case 30:
					return null;
			}
			throw Error(
				'Unknown unit of work tag (' +
					X.tag +
					'). This error is likely caused by a bug in React. Please file an issue.',
			);
		}
		function RM(B, X) {
			switch ((HG(X), X.tag)) {
				case 1:
					return (
						(B = X.flags),
						B & 65536 ? ((X.flags = (B & -65537) | 128), (X.mode & e) !== p && G3(X), X) : null
					);
				case 3:
					return (
						C6(Z2, X),
						l(X),
						(B = X.flags),
						(B & 65536) !== 0 && (B & 128) === 0 ? ((X.flags = (B & -65537) | 128), X) : null
					);
				case 26:
				case 27:
				case 5:
					return (j0(X), null);
				case 31:
					if (X.memoizedState !== null) {
						if ((R5(X), X.alternate === null))
							throw Error(
								'Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.',
							);
						B1();
					}
					return (
						(B = X.flags),
						B & 65536 ? ((X.flags = (B & -65537) | 128), (X.mode & e) !== p && G3(X), X) : null
					);
				case 13:
					if ((R5(X), (B = X.memoizedState), B !== null && B.dehydrated !== null)) {
						if (X.alternate === null)
							throw Error(
								'Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.',
							);
						B1();
					}
					return (
						(B = X.flags),
						B & 65536 ? ((X.flags = (B & -65537) | 128), (X.mode & e) !== p && G3(X), X) : null
					);
				case 19:
					return (K0(e0, X), null);
				case 4:
					return (l(X), null);
				case 10:
					return (C6(X.type, X), null);
				case 22:
				case 23:
					return (
						R5(X),
						jG(X),
						B !== null && K0(K1, X),
						(B = X.flags),
						B & 65536 ? ((X.flags = (B & -65537) | 128), (X.mode & e) !== p && G3(X), X) : null
					);
				case 24:
					return (C6(Z2, X), null);
				case 25:
					return null;
				default:
					return null;
			}
		}
		function vR(B, X) {
			switch ((HG(X), X.tag)) {
				case 3:
					(C6(Z2, X), l(X));
					break;
				case 26:
				case 27:
				case 5:
					j0(X);
					break;
				case 4:
					l(X);
					break;
				case 31:
					X.memoizedState !== null && R5(X);
					break;
				case 13:
					R5(X);
					break;
				case 19:
					K0(e0, X);
					break;
				case 10:
					C6(X.type, X);
					break;
				case 22:
				case 23:
					(R5(X), jG(X), B !== null && K0(K1, X));
					break;
				case 24:
					C6(Z2, X);
			}
		}
		function $6(B) {
			return (B.mode & e) !== p;
		}
		function SR(B, X) {
			$6(B) ? (Y6(), M3(X, B), Z6()) : M3(X, B);
		}
		function U8(B, X, G) {
			$6(B) ? (Y6(), o1(G, B, X), Z6()) : o1(G, B, X);
		}
		function M3(B, X) {
			try {
				var G = X.updateQueue,
					Z = G !== null ? G.lastEffect : null;
				if (Z !== null) {
					var Y = Z.next;
					G = Y;
					do {
						if (
							(G.tag & B) === B &&
							((Z = void 0),
							(B & f2) !== H9 && (kX = !0),
							(Z = k(X, CW, G)),
							(B & f2) !== H9 && (kX = !1),
							Z !== void 0 && typeof Z !== 'function')
						) {
							var $ = void 0;
							$ =
								(G.tag & W5) !== 0
									? 'useLayoutEffect'
									: (G.tag & f2) !== 0
										? 'useInsertionEffect'
										: 'useEffect';
							var R = void 0;
							((R =
								Z === null
									? ' You returned null. If your effect does not require clean up, return undefined (or nothing).'
									: typeof Z.then === 'function'
										? `

It looks like you wrote ` +
											$ +
											`(async () => ...) or returned a Promise. Instead, write the async function inside your effect and call it immediately:

` +
											$ +
											`(() => {
  async function fetchData() {
    // You can await here
    const response = await MyAPI.getData(someId);
    // ...
  }
  fetchData();
}, [someId]); // Or [] if effect doesn't need props or state

Learn more about data fetching with Hooks: https://react.dev/link/hooks-data-fetching`
										: ' You returned: ' + Z),
								k(
									X,
									function (z, H) {
										console.error(
											'%s must not return anything besides a function, which is used for clean-up.%s',
											z,
											H,
										);
									},
									$,
									R,
								));
						}
						G = G.next;
					} while (G !== Y);
				}
			} catch (z) {
				_0(X, X.return, z);
			}
		}
		function o1(B, X, G) {
			try {
				var Z = X.updateQueue,
					Y = Z !== null ? Z.lastEffect : null;
				if (Y !== null) {
					var $ = Y.next;
					Z = $;
					do {
						if ((Z.tag & B) === B) {
							var R = Z.inst,
								z = R.destroy;
							z !== void 0 &&
								((R.destroy = void 0),
								(B & f2) !== H9 && (kX = !0),
								(Y = X),
								k(Y, DW, Y, G, z),
								(B & f2) !== H9 && (kX = !1));
						}
						Z = Z.next;
					} while (Z !== $);
				}
			} catch (H) {
				_0(X, X.return, H);
			}
		}
		function gR(B, X) {
			$6(B) ? (Y6(), M3(X, B), Z6()) : M3(X, B);
		}
		function Q8(B, X, G) {
			$6(B) ? (Y6(), o1(G, B, X), Z6()) : o1(G, B, X);
		}
		function kR(B) {
			var X = B.updateQueue;
			if (X !== null) {
				var G = B.stateNode;
				B.type.defaultProps ||
					'ref' in B.memoizedProps ||
					DX ||
					(G.props !== B.memoizedProps &&
						console.error(
							'Expected %s props to match memoized props before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.',
							v(B) || 'instance',
						),
					G.state !== B.memoizedState &&
						console.error(
							'Expected %s state to match memoized state before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.',
							v(B) || 'instance',
						));
				try {
					k(B, m$, X, G);
				} catch (Z) {
					_0(B, B.return, Z);
				}
			}
		}
		function zM(B, X, G) {
			return B.getSnapshotBeforeUpdate(X, G);
		}
		function HM(B, X) {
			var { memoizedProps: G, memoizedState: Z } = X;
			((X = B.stateNode),
				B.type.defaultProps ||
					'ref' in B.memoizedProps ||
					DX ||
					(X.props !== B.memoizedProps &&
						console.error(
							'Expected %s props to match memoized props before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.',
							v(B) || 'instance',
						),
					X.state !== B.memoizedState &&
						console.error(
							'Expected %s state to match memoized state before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.',
							v(B) || 'instance',
						)));
			try {
				var Y = R1(B.type, G),
					$ = k(B, zM, X, Y, Z);
				((G = KU),
					$ !== void 0 ||
						G.has(B.type) ||
						(G.add(B.type),
						k(B, function () {
							console.error(
								'%s.getSnapshotBeforeUpdate(): A snapshot value (or null) must be returned. You have returned undefined.',
								v(B),
							);
						})),
					(X.__reactInternalSnapshotBeforeUpdate = $));
			} catch (R) {
				_0(B, B.return, R);
			}
		}
		function bR(B, X, G) {
			((G.props = R1(B.type, B.memoizedProps)),
				(G.state = B.memoizedState),
				$6(B) ? (Y6(), k(B, kJ, B, X, G), Z6()) : k(B, kJ, B, X, G));
		}
		function JM(B) {
			var X = B.ref;
			if (X !== null) {
				switch (B.tag) {
					case 26:
					case 27:
					case 5:
						var G = B.stateNode;
						break;
					case 30:
						G = B.stateNode;
						break;
					default:
						G = B.stateNode;
				}
				if (typeof X === 'function')
					if ($6(B))
						try {
							(Y6(), (B.refCleanup = X(G)));
						} finally {
							Z6();
						}
					else B.refCleanup = X(G);
				else
					(typeof X === 'string'
						? console.error('String refs are no longer supported.')
						: X.hasOwnProperty('current') ||
							console.error(
								'Unexpected ref object provided for %s. Use either a ref-setter function or React.createRef().',
								v(B),
							),
						(X.current = G));
			}
		}
		function q3(B, X) {
			try {
				k(B, JM, B);
			} catch (G) {
				_0(B, X, G);
			}
		}
		function R6(B, X) {
			var { ref: G, refCleanup: Z } = B;
			if (G !== null)
				if (typeof Z === 'function')
					try {
						if ($6(B))
							try {
								(Y6(), k(B, Z));
							} finally {
								Z6(B);
							}
						else k(B, Z);
					} catch (Y) {
						_0(B, X, Y);
					} finally {
						((B.refCleanup = null), (B = B.alternate), B != null && (B.refCleanup = null));
					}
				else if (typeof G === 'function')
					try {
						if ($6(B))
							try {
								(Y6(), k(B, G, null));
							} finally {
								Z6(B);
							}
						else k(B, G, null);
					} catch (Y) {
						_0(B, X, Y);
					}
				else G.current = null;
		}
		function mR(B, X, G, Z) {
			var Y = B.memoizedProps,
				$ = Y.id,
				R = Y.onCommit;
			((Y = Y.onRender),
				(X = X === null ? 'mount' : 'update'),
				G9 && (X = 'nested-update'),
				typeof Y === 'function' &&
					Y($, X, B.actualDuration, B.treeBaseDuration, B.actualStartTime, G),
				typeof R === 'function' && R($, X, Z, G));
		}
		function UM(B, X, G, Z) {
			var Y = B.memoizedProps;
			((B = Y.id),
				(Y = Y.onPostCommit),
				(X = X === null ? 'mount' : 'update'),
				G9 && (X = 'nested-update'),
				typeof Y === 'function' && Y(B, X, Z, G));
		}
		function yR(B) {
			var { type: X, memoizedProps: G, stateNode: Z } = B;
			try {
				k(B, gM, Z, X, G, B);
			} catch (Y) {
				_0(B, B.return, Y);
			}
		}
		function M8(B, X, G) {
			try {
				k(B, bM, B.stateNode, B.type, G, X, B);
			} catch (Z) {
				_0(B, B.return, Z);
			}
		}
		function fR(B) {
			return (
				B.tag === 5 || B.tag === 3 || B.tag === 26 || (B.tag === 27 && MB(B.type)) || B.tag === 4
			);
		}
		function q8(B) {
			B: for (;;) {
				for (; B.sibling === null;) {
					if (B.return === null || fR(B.return)) return null;
					B = B.return;
				}
				B.sibling.return = B.return;
				for (B = B.sibling; B.tag !== 5 && B.tag !== 6 && B.tag !== 18;) {
					if (B.tag === 27 && MB(B.type)) continue B;
					if (B.flags & 2) continue B;
					if (B.child === null || B.tag === 4) continue B;
					else ((B.child.return = B), (B = B.child));
				}
				if (!(B.flags & 2)) return B.stateNode;
			}
		}
		function W8(B, X, G) {
			var Z = B.tag;
			if (Z === 5 || Z === 6)
				((B = B.stateNode),
					X
						? (cz(G),
							(G.nodeType === 9
								? G.body
								: G.nodeName === 'HTML'
									? G.ownerDocument.body
									: G
							).insertBefore(B, X))
						: (cz(G),
							(X = G.nodeType === 9 ? G.body : G.nodeName === 'HTML' ? G.ownerDocument.body : G),
							X.appendChild(B),
							(G = G._reactRootContainer),
							(G !== null && G !== void 0) || X.onclick !== null || (X.onclick = E6)));
			else if (
				Z !== 4 &&
				(Z === 27 && MB(B.type) && ((G = B.stateNode), (X = null)), (B = B.child), B !== null)
			)
				for (W8(B, X, G), B = B.sibling; B !== null;) (W8(B, X, G), (B = B.sibling));
		}
		function K7(B, X, G) {
			var Z = B.tag;
			if (Z === 5 || Z === 6) ((B = B.stateNode), X ? G.insertBefore(B, X) : G.appendChild(B));
			else if (Z !== 4 && (Z === 27 && MB(B.type) && (G = B.stateNode), (B = B.child), B !== null))
				for (K7(B, X, G), B = B.sibling; B !== null;) (K7(B, X, G), (B = B.sibling));
		}
		function QM(B) {
			for (var X, G = B.return; G !== null;) {
				if (fR(G)) {
					X = G;
					break;
				}
				G = G.return;
			}
			if (X == null)
				throw Error(
					'Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.',
				);
			switch (X.tag) {
				case 27:
					((X = X.stateNode), (G = q8(B)), K7(B, G, X));
					break;
				case 5:
					((G = X.stateNode), X.flags & 32 && (pz(G), (X.flags &= -33)), (X = q8(B)), K7(B, X, G));
					break;
				case 3:
				case 4:
					((X = X.stateNode.containerInfo), (G = q8(B)), W8(B, G, X));
					break;
				default:
					throw Error(
						'Invalid host parent fiber. This error is likely caused by a bug in React. Please file an issue.',
					);
			}
		}
		function uR(B) {
			var { stateNode: X, memoizedProps: G } = B;
			try {
				k(B, rM, B.type, G, X, B);
			} catch (Z) {
				_0(B, B.return, Z);
			}
		}
		function hR(B, X) {
			return X.tag === 31
				? ((X = X.memoizedState), B.memoizedState !== null && X === null)
				: X.tag === 13
					? ((B = B.memoizedState),
						(X = X.memoizedState),
						B !== null && B.dehydrated !== null && (X === null || X.dehydrated === null))
					: X.tag === 3
						? B.memoizedState.isDehydrated && (X.flags & 256) === 0
						: !1;
		}
		function MM(B, X) {
			if (((B = B.containerInfo), (qY = b9), (B = Z$(B)), t9(B))) {
				if ('selectionStart' in B) var G = { start: B.selectionStart, end: B.selectionEnd };
				else
					B: {
						G = ((G = B.ownerDocument) && G.defaultView) || window;
						var Z = G.getSelection && G.getSelection();
						if (Z && Z.rangeCount !== 0) {
							G = Z.anchorNode;
							var { anchorOffset: Y, focusNode: $ } = Z;
							Z = Z.focusOffset;
							try {
								(G.nodeType, $.nodeType);
							} catch (V) {
								G = null;
								break B;
							}
							var R = 0,
								z = -1,
								H = -1,
								J = 0,
								w = 0,
								K = B,
								M = null;
							X: for (;;) {
								for (var _; ;) {
									if (
										(K !== G || (Y !== 0 && K.nodeType !== 3) || (z = R + Y),
										K !== $ || (Z !== 0 && K.nodeType !== 3) || (H = R + Z),
										K.nodeType === 3 && (R += K.nodeValue.length),
										(_ = K.firstChild) === null)
									)
										break;
									((M = K), (K = _));
								}
								for (;;) {
									if (K === B) break X;
									if (
										(M === G && ++J === Y && (z = R),
										M === $ && ++w === Z && (H = R),
										(_ = K.nextSibling) !== null)
									)
										break;
									((K = M), (M = K.parentNode));
								}
								K = _;
							}
							G = z === -1 || H === -1 ? null : { start: z, end: H };
						} else G = null;
					}
				G = G || { start: 0, end: 0 };
			} else G = null;
			((WY = { focusedElem: B, selectionRange: G }), (b9 = !1));
			for (_2 = X; _2 !== null;)
				if (((X = _2), (B = X.child), (X.subtreeFlags & 1028) !== 0 && B !== null))
					((B.return = X), (_2 = B));
				else
					for (; _2 !== null;) {
						switch (((B = X = _2), (G = B.alternate), (Y = B.flags), B.tag)) {
							case 0:
								if (
									(Y & 4) !== 0 &&
									((B = B.updateQueue), (B = B !== null ? B.events : null), B !== null)
								)
									for (G = 0; G < B.length; G++) ((Y = B[G]), (Y.ref.impl = Y.nextImpl));
								break;
							case 11:
							case 15:
								break;
							case 1:
								(Y & 1024) !== 0 && G !== null && HM(B, G);
								break;
							case 3:
								if ((Y & 1024) !== 0) {
									if (((B = B.stateNode.containerInfo), (G = B.nodeType), G === 9)) g8(B);
									else if (G === 1)
										switch (B.nodeName) {
											case 'HEAD':
											case 'HTML':
											case 'BODY':
												g8(B);
												break;
											default:
												B.textContent = '';
										}
								}
								break;
							case 5:
							case 26:
							case 27:
							case 6:
							case 4:
							case 17:
								break;
							default:
								if ((Y & 1024) !== 0)
									throw Error(
										'This unit of work tag should not have side-effects. This error is likely caused by a bug in React. Please file an issue.',
									);
						}
						if (((B = X.sibling), B !== null)) {
							((B.return = X.return), (_2 = B));
							break;
						}
						_2 = X.return;
					}
		}
		function dR(B, X, G) {
			var Z = Y5(),
				Y = e5(),
				$ = X6(),
				R = G6(),
				z = G.flags;
			switch (G.tag) {
				case 0:
				case 11:
				case 15:
					(z6(B, G), z & 4 && SR(G, W5 | D5));
					break;
				case 1:
					if ((z6(B, G), z & 4))
						if (((B = G.stateNode), X === null))
							(G.type.defaultProps ||
								'ref' in G.memoizedProps ||
								DX ||
								(B.props !== G.memoizedProps &&
									console.error(
										'Expected %s props to match memoized props before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.',
										v(G) || 'instance',
									),
								B.state !== G.memoizedState &&
									console.error(
										'Expected %s state to match memoized state before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.',
										v(G) || 'instance',
									)),
								$6(G) ? (Y6(), k(G, kZ, G, B), Z6()) : k(G, kZ, G, B));
						else {
							var H = R1(G.type, X.memoizedProps);
							((X = X.memoizedState),
								G.type.defaultProps ||
									'ref' in G.memoizedProps ||
									DX ||
									(B.props !== G.memoizedProps &&
										console.error(
											'Expected %s props to match memoized props before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.',
											v(G) || 'instance',
										),
									B.state !== G.memoizedState &&
										console.error(
											'Expected %s state to match memoized state before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.',
											v(G) || 'instance',
										)),
								$6(G)
									? (Y6(), k(G, vJ, G, B, H, X, B.__reactInternalSnapshotBeforeUpdate), Z6())
									: k(G, vJ, G, B, H, X, B.__reactInternalSnapshotBeforeUpdate));
						}
					(z & 64 && kR(G), z & 512 && q3(G, G.return));
					break;
				case 3:
					if (((X = D6()), z6(B, G), z & 64 && ((z = G.updateQueue), z !== null))) {
						if (((H = null), G.child !== null))
							switch (G.child.tag) {
								case 27:
								case 5:
									H = G.child.stateNode;
									break;
								case 1:
									H = G.child.stateNode;
							}
						try {
							k(G, m$, z, H);
						} catch (w) {
							_0(G, G.return, w);
						}
					}
					B.effectDuration += s4(X);
					break;
				case 27:
					X === null && z & 4 && uR(G);
				case 26:
				case 5:
					if ((z6(B, G), X === null)) {
						if (z & 4) yR(G);
						else if (z & 64) {
							((B = G.type), (X = G.memoizedProps), (H = G.stateNode));
							try {
								k(G, kM, H, B, X, G);
							} catch (w) {
								_0(G, G.return, w);
							}
						}
					}
					z & 512 && q3(G, G.return);
					break;
				case 12:
					if (z & 4) {
						((z = D6()), z6(B, G), (B = G.stateNode), (B.effectDuration += X3(z)));
						try {
							k(G, mR, G, X, FB, B.effectDuration);
						} catch (w) {
							_0(G, G.return, w);
						}
					} else z6(B, G);
					break;
				case 31:
					(z6(B, G), z & 4 && pR(B, G));
					break;
				case 13:
					(z6(B, G),
						z & 4 && cR(B, G),
						z & 64 &&
							((B = G.memoizedState),
							B !== null &&
								((B = B.dehydrated), B !== null && ((z = jM.bind(null, G)), oM(B, z)))));
					break;
				case 22:
					if (((z = G.memoizedState !== null || c6), !z)) {
						((X = (X !== null && X.memoizedState !== null) || z2), (H = c6));
						var J = z2;
						((c6 = z),
							(z2 = X) && !J
								? (H6(B, G, (G.subtreeFlags & 8772) !== 0),
									(G.mode & e) !== p && 0 <= u && 0 <= s && 0.05 < s - u && S4(G, u, s))
								: z6(B, G),
							(c6 = H),
							(z2 = J));
					}
					break;
				case 30:
					break;
				default:
					z6(B, G);
			}
			((G.mode & e) !== p &&
				0 <= u &&
				0 <= s &&
				((i0 || 0.05 < c0) && t5(G, u, s, c0, s0),
				G.alternate === null &&
					G.return !== null &&
					G.return.alternate !== null &&
					0.05 < s - u &&
					(hR(G.return.alternate, G.return) || i5(G, u, s, 'Mount'))),
				$5(Z),
				B6(Y),
				(s0 = $),
				(i0 = R));
		}
		function sR(B) {
			var X = B.alternate;
			(X !== null && ((B.alternate = null), sR(X)),
				(B.child = null),
				(B.deletions = null),
				(B.sibling = null),
				B.tag === 5 && ((X = B.stateNode), X !== null && C(X)),
				(B.stateNode = null),
				(B._debugOwner = null),
				(B.return = null),
				(B.dependencies = null),
				(B.memoizedProps = null),
				(B.memoizedState = null),
				(B.pendingProps = null),
				(B.stateNode = null),
				(B.updateQueue = null));
		}
		function S6(B, X, G) {
			for (G = G.child; G !== null;) (lR(B, X, G), (G = G.sibling));
		}
		function lR(B, X, G) {
			if (D2 && typeof D2.onCommitFiberUnmount === 'function')
				try {
					D2.onCommitFiberUnmount(RX, G);
				} catch (J) {
					W6 || ((W6 = !0), console.error('React instrumentation encountered an error: %o', J));
				}
			var Z = Y5(),
				Y = e5(),
				$ = X6(),
				R = G6();
			switch (G.tag) {
				case 26:
					(z2 || R6(G, X),
						S6(B, X, G),
						G.memoizedState
							? G.memoizedState.count--
							: G.stateNode && ((B = G.stateNode), B.parentNode.removeChild(B)));
					break;
				case 27:
					z2 || R6(G, X);
					var z = H2,
						H = c2;
					(MB(G.type) && ((H2 = G.stateNode), (c2 = !1)),
						S6(B, X, G),
						k(G, F3, G.stateNode),
						(H2 = z),
						(c2 = H));
					break;
				case 5:
					z2 || R6(G, X);
				case 6:
					if (((z = H2), (H = c2), (H2 = null), S6(B, X, G), (H2 = z), (c2 = H), H2 !== null))
						if (c2)
							try {
								k(G, fM, H2, G.stateNode);
							} catch (J) {
								_0(G, X, J);
							}
						else
							try {
								k(G, yM, H2, G.stateNode);
							} catch (J) {
								_0(G, X, J);
							}
					break;
				case 18:
					H2 !== null &&
						(c2
							? ((B = H2),
								az(
									B.nodeType === 9 ? B.body : B.nodeName === 'HTML' ? B.ownerDocument.body : B,
									G.stateNode,
								),
								GX(B))
							: az(H2, G.stateNode));
					break;
				case 4:
					((z = H2),
						(H = c2),
						(H2 = G.stateNode.containerInfo),
						(c2 = !0),
						S6(B, X, G),
						(H2 = z),
						(c2 = H));
					break;
				case 0:
				case 11:
				case 14:
				case 15:
					(o1(f2, G, X), z2 || U8(G, X, W5), S6(B, X, G));
					break;
				case 1:
					(z2 ||
						(R6(G, X),
						(z = G.stateNode),
						typeof z.componentWillUnmount === 'function' && bR(G, X, z)),
						S6(B, X, G));
					break;
				case 21:
					S6(B, X, G);
					break;
				case 22:
					((z2 = (z = z2) || G.memoizedState !== null), S6(B, X, G), (z2 = z));
					break;
				default:
					S6(B, X, G);
			}
			((G.mode & e) !== p && 0 <= u && 0 <= s && (i0 || 0.05 < c0) && t5(G, u, s, c0, s0),
				$5(Z),
				B6(Y),
				(s0 = $),
				(i0 = R));
		}
		function pR(B, X) {
			if (
				X.memoizedState === null &&
				((B = X.alternate), B !== null && ((B = B.memoizedState), B !== null))
			) {
				B = B.dehydrated;
				try {
					k(X, iM, B);
				} catch (G) {
					_0(X, X.return, G);
				}
			}
		}
		function cR(B, X) {
			if (
				X.memoizedState === null &&
				((B = X.alternate),
				B !== null && ((B = B.memoizedState), B !== null && ((B = B.dehydrated), B !== null)))
			)
				try {
					k(X, tM, B);
				} catch (G) {
					_0(X, X.return, G);
				}
		}
		function qM(B) {
			switch (B.tag) {
				case 31:
				case 13:
				case 19:
					var X = B.stateNode;
					return (X === null && (X = B.stateNode = new OU()), X);
				case 22:
					return (
						(B = B.stateNode),
						(X = B._retryCache),
						X === null && (X = B._retryCache = new OU()),
						X
					);
				default:
					throw Error('Unexpected Suspense handler tag (' + B.tag + '). This is a bug in React.');
			}
		}
		function O7(B, X) {
			var G = qM(B);
			X.forEach(function (Z) {
				if (!G.has(Z)) {
					if ((G.add(Z), w6))
						if (TX !== null && vX !== null) O3(vX, TX);
						else throw Error('Expected finished root and lanes to be set. This is a bug in React.');
					var Y = FM.bind(null, B, Z);
					Z.then(Y, Y);
				}
			});
		}
		function l2(B, X) {
			var G = X.deletions;
			if (G !== null)
				for (var Z = 0; Z < G.length; Z++) {
					var Y = B,
						$ = X,
						R = G[Z],
						z = Y5(),
						H = $;
					B: for (; H !== null;) {
						switch (H.tag) {
							case 27:
								if (MB(H.type)) {
									((H2 = H.stateNode), (c2 = !1));
									break B;
								}
								break;
							case 5:
								((H2 = H.stateNode), (c2 = !1));
								break B;
							case 3:
							case 4:
								((H2 = H.stateNode.containerInfo), (c2 = !0));
								break B;
						}
						H = H.return;
					}
					if (H2 === null)
						throw Error(
							'Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.',
						);
					(lR(Y, $, R),
						(H2 = null),
						(c2 = !1),
						(R.mode & e) !== p && 0 <= u && 0 <= s && 0.05 < s - u && i5(R, u, s, 'Unmount'),
						$5(z),
						(Y = R),
						($ = Y.alternate),
						$ !== null && ($.return = null),
						(Y.return = null));
				}
			if (X.subtreeFlags & 13886) for (X = X.child; X !== null;) (aR(X, B), (X = X.sibling));
		}
		function aR(B, X) {
			var G = Y5(),
				Z = e5(),
				Y = X6(),
				$ = G6(),
				R = B.alternate,
				z = B.flags;
			switch (B.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					(l2(X, B),
						p2(B),
						z & 4 && (o1(f2 | D5, B, B.return), M3(f2 | D5, B), U8(B, B.return, W5 | D5)));
					break;
				case 1:
					if (
						(l2(X, B),
						p2(B),
						z & 512 && (z2 || R === null || R6(R, R.return)),
						z & 64 && c6 && ((z = B.updateQueue), z !== null && ((R = z.callbacks), R !== null)))
					) {
						var H = z.shared.hiddenCallbacks;
						z.shared.hiddenCallbacks = H === null ? R : H.concat(R);
					}
					break;
				case 26:
					if (
						((H = d5), l2(X, B), p2(B), z & 512 && (z2 || R === null || R6(R, R.return)), z & 4)
					) {
						var J = R !== null ? R.memoizedState : null;
						if (((z = B.memoizedState), R === null))
							if (z === null)
								if (B.stateNode === null) {
									B: {
										((z = B.type), (R = B.memoizedProps), (H = H.ownerDocument || H));
										X: switch (z) {
											case 'title':
												if (
													((J = H.getElementsByTagName('title')[0]),
													!J ||
														J[C3] ||
														J[N2] ||
														J.namespaceURI === HX ||
														J.hasAttribute('itemprop'))
												)
													((J = H.createElement(z)),
														H.head.insertBefore(J, H.querySelector('head > title')));
												(x2(J, z, R), (J[N2] = B), f(J), (z = J));
												break B;
											case 'link':
												var w = YH('link', 'href', H).get(z + (R.href || ''));
												if (w) {
													for (var K = 0; K < w.length; K++)
														if (
															((J = w[K]),
															J.getAttribute('href') ===
																(R.href == null || R.href === '' ? null : R.href) &&
																J.getAttribute('rel') === (R.rel == null ? null : R.rel) &&
																J.getAttribute('title') === (R.title == null ? null : R.title) &&
																J.getAttribute('crossorigin') ===
																	(R.crossOrigin == null ? null : R.crossOrigin))
														) {
															w.splice(K, 1);
															break X;
														}
												}
												((J = H.createElement(z)), x2(J, z, R), H.head.appendChild(J));
												break;
											case 'meta':
												if ((w = YH('meta', 'content', H).get(z + (R.content || '')))) {
													for (K = 0; K < w.length; K++)
														if (
															((J = w[K]),
															V0(R.content, 'content'),
															J.getAttribute('content') ===
																(R.content == null ? null : '' + R.content) &&
																J.getAttribute('name') === (R.name == null ? null : R.name) &&
																J.getAttribute('property') ===
																	(R.property == null ? null : R.property) &&
																J.getAttribute('http-equiv') ===
																	(R.httpEquiv == null ? null : R.httpEquiv) &&
																J.getAttribute('charset') ===
																	(R.charSet == null ? null : R.charSet))
														) {
															w.splice(K, 1);
															break X;
														}
												}
												((J = H.createElement(z)), x2(J, z, R), H.head.appendChild(J));
												break;
											default:
												throw Error(
													'getNodesForType encountered a type it did not expect: "' +
														z +
														'". This is a bug in React.',
												);
										}
										((J[N2] = B), f(J), (z = J));
									}
									B.stateNode = z;
								} else $H(H, B.type, B.stateNode);
							else B.stateNode = ZH(H, z, B.memoizedProps);
						else
							J !== z
								? (J === null
										? R.stateNode !== null && ((R = R.stateNode), R.parentNode.removeChild(R))
										: J.count--,
									z === null ? $H(H, B.type, B.stateNode) : ZH(H, z, B.memoizedProps))
								: z === null && B.stateNode !== null && M8(B, B.memoizedProps, R.memoizedProps);
					}
					break;
				case 27:
					(l2(X, B),
						p2(B),
						z & 512 && (z2 || R === null || R6(R, R.return)),
						R !== null && z & 4 && M8(B, B.memoizedProps, R.memoizedProps));
					break;
				case 5:
					if ((l2(X, B), p2(B), z & 512 && (z2 || R === null || R6(R, R.return)), B.flags & 32)) {
						H = B.stateNode;
						try {
							k(B, pz, H);
						} catch (S) {
							_0(B, B.return, S);
						}
					}
					(z & 4 &&
						B.stateNode != null &&
						((H = B.memoizedProps), M8(B, H, R !== null ? R.memoizedProps : H)),
						z & 1024 &&
							((oZ = !0),
							B.type !== 'form' &&
								console.error(
									'Unexpected host component type. Expected a form. This is a bug in React.',
								)));
					break;
				case 6:
					if ((l2(X, B), p2(B), z & 4)) {
						if (B.stateNode === null)
							throw Error(
								'This should have a text node initialized. This error is likely caused by a bug in React. Please file an issue.',
							);
						((z = B.memoizedProps), (R = R !== null ? R.memoizedProps : z), (H = B.stateNode));
						try {
							k(B, mM, H, R, z);
						} catch (S) {
							_0(B, B.return, S);
						}
					}
					break;
				case 3:
					if (
						((H = D6()),
						(S9 = null),
						(J = d5),
						(d5 = N7(X.containerInfo)),
						l2(X, B),
						(d5 = J),
						p2(B),
						z & 4 && R !== null && R.memoizedState.isDehydrated)
					)
						try {
							k(B, nM, X.containerInfo);
						} catch (S) {
							_0(B, B.return, S);
						}
					(oZ && ((oZ = !1), oR(B)), (X.effectDuration += s4(H)));
					break;
				case 4:
					((z = d5), (d5 = N7(B.stateNode.containerInfo)), l2(X, B), p2(B), (d5 = z));
					break;
				case 12:
					((z = D6()), l2(X, B), p2(B), (B.stateNode.effectDuration += X3(z)));
					break;
				case 31:
					(l2(X, B),
						p2(B),
						z & 4 && ((z = B.updateQueue), z !== null && ((B.updateQueue = null), O7(B, z))));
					break;
				case 13:
					(l2(X, B),
						p2(B),
						B.child.flags & 8192 &&
							(B.memoizedState !== null) !== (R !== null && R.memoizedState !== null) &&
							(_9 = K2()),
						z & 4 && ((z = B.updateQueue), z !== null && ((B.updateQueue = null), O7(B, z))));
					break;
				case 22:
					H = B.memoizedState !== null;
					var M = R !== null && R.memoizedState !== null,
						_ = c6,
						V = z2;
					if (
						((c6 = _ || H),
						(z2 = V || M),
						l2(X, B),
						(z2 = V),
						(c6 = _),
						M &&
							!H &&
							!_ &&
							!V &&
							(B.mode & e) !== p &&
							0 <= u &&
							0 <= s &&
							0.05 < s - u &&
							S4(B, u, s),
						p2(B),
						z & 8192)
					)
						B: for (
							X = B.stateNode,
								X._visibility = H ? X._visibility & ~y3 : X._visibility | y3,
								!H ||
									R === null ||
									M ||
									c6 ||
									z2 ||
									(z1(B),
									(B.mode & e) !== p &&
										0 <= u &&
										0 <= s &&
										0.05 < s - u &&
										i5(B, u, s, 'Disconnect')),
								R = null,
								X = B;
							;
						) {
							if (X.tag === 5 || X.tag === 26) {
								if (R === null) {
									M = R = X;
									try {
										((J = M.stateNode), H ? k(M, hM, J) : k(M, lM, M.stateNode, M.memoizedProps));
									} catch (S) {
										_0(M, M.return, S);
									}
								}
							} else if (X.tag === 6) {
								if (R === null) {
									M = X;
									try {
										((w = M.stateNode), H ? k(M, dM, w) : k(M, pM, w, M.memoizedProps));
									} catch (S) {
										_0(M, M.return, S);
									}
								}
							} else if (X.tag === 18) {
								if (R === null) {
									M = X;
									try {
										((K = M.stateNode), H ? k(M, uM, K) : k(M, sM, M.stateNode));
									} catch (S) {
										_0(M, M.return, S);
									}
								}
							} else if (
								((X.tag !== 22 && X.tag !== 23) || X.memoizedState === null || X === B) &&
								X.child !== null
							) {
								((X.child.return = X), (X = X.child));
								continue;
							}
							if (X === B) break B;
							for (; X.sibling === null;) {
								if (X.return === null || X.return === B) break B;
								(R === X && (R = null), (X = X.return));
							}
							(R === X && (R = null), (X.sibling.return = X.return), (X = X.sibling));
						}
					z & 4 &&
						((z = B.updateQueue),
						z !== null && ((R = z.retryQueue), R !== null && ((z.retryQueue = null), O7(B, R))));
					break;
				case 19:
					(l2(X, B),
						p2(B),
						z & 4 && ((z = B.updateQueue), z !== null && ((B.updateQueue = null), O7(B, z))));
					break;
				case 30:
					break;
				case 21:
					break;
				default:
					(l2(X, B), p2(B));
			}
			((B.mode & e) !== p &&
				0 <= u &&
				0 <= s &&
				((i0 || 0.05 < c0) && t5(B, u, s, c0, s0),
				B.alternate === null &&
					B.return !== null &&
					B.return.alternate !== null &&
					0.05 < s - u &&
					(hR(B.return.alternate, B.return) || i5(B, u, s, 'Mount'))),
				$5(G),
				B6(Z),
				(s0 = Y),
				(i0 = $));
		}
		function p2(B) {
			var X = B.flags;
			if (X & 2) {
				try {
					k(B, QM, B);
				} catch (G) {
					_0(B, B.return, G);
				}
				B.flags &= -3;
			}
			X & 4096 && (B.flags &= -4097);
		}
		function oR(B) {
			if (B.subtreeFlags & 1024)
				for (B = B.child; B !== null;) {
					var X = B;
					(oR(X), X.tag === 5 && X.flags & 1024 && X.stateNode.reset(), (B = B.sibling));
				}
		}
		function z6(B, X) {
			if (X.subtreeFlags & 8772)
				for (X = X.child; X !== null;) (dR(B, X.alternate, X), (X = X.sibling));
		}
		function nR(B) {
			var X = Y5(),
				G = e5(),
				Z = X6(),
				Y = G6();
			switch (B.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					(U8(B, B.return, W5), z1(B));
					break;
				case 1:
					R6(B, B.return);
					var $ = B.stateNode;
					(typeof $.componentWillUnmount === 'function' && bR(B, B.return, $), z1(B));
					break;
				case 27:
					k(B, F3, B.stateNode);
				case 26:
				case 5:
					(R6(B, B.return), z1(B));
					break;
				case 22:
					B.memoizedState === null && z1(B);
					break;
				case 30:
					z1(B);
					break;
				default:
					z1(B);
			}
			((B.mode & e) !== p && 0 <= u && 0 <= s && (i0 || 0.05 < c0) && t5(B, u, s, c0, s0),
				$5(X),
				B6(G),
				(s0 = Z),
				(i0 = Y));
		}
		function z1(B) {
			for (B = B.child; B !== null;) (nR(B), (B = B.sibling));
		}
		function iR(B, X, G, Z) {
			var Y = Y5(),
				$ = e5(),
				R = X6(),
				z = G6(),
				H = G.flags;
			switch (G.tag) {
				case 0:
				case 11:
				case 15:
					(H6(B, G, Z), SR(G, W5));
					break;
				case 1:
					if (
						(H6(B, G, Z),
						(X = G.stateNode),
						typeof X.componentDidMount === 'function' && k(G, kZ, G, X),
						(X = G.updateQueue),
						X !== null)
					) {
						B = G.stateNode;
						try {
							k(G, nQ, X, B);
						} catch (J) {
							_0(G, G.return, J);
						}
					}
					(Z && H & 64 && kR(G), q3(G, G.return));
					break;
				case 27:
					uR(G);
				case 26:
				case 5:
					(H6(B, G, Z), Z && X === null && H & 4 && yR(G), q3(G, G.return));
					break;
				case 12:
					if (Z && H & 4) {
						((H = D6()), H6(B, G, Z), (Z = G.stateNode), (Z.effectDuration += X3(H)));
						try {
							k(G, mR, G, X, FB, Z.effectDuration);
						} catch (J) {
							_0(G, G.return, J);
						}
					} else H6(B, G, Z);
					break;
				case 31:
					(H6(B, G, Z), Z && H & 4 && pR(B, G));
					break;
				case 13:
					(H6(B, G, Z), Z && H & 4 && cR(B, G));
					break;
				case 22:
					(G.memoizedState === null && H6(B, G, Z), q3(G, G.return));
					break;
				case 30:
					break;
				default:
					H6(B, G, Z);
			}
			((G.mode & e) !== p && 0 <= u && 0 <= s && (i0 || 0.05 < c0) && t5(G, u, s, c0, s0),
				$5(Y),
				B6($),
				(s0 = R),
				(i0 = z));
		}
		function H6(B, X, G) {
			G = G && (X.subtreeFlags & 8772) !== 0;
			for (X = X.child; X !== null;) (iR(B, X.alternate, X, G), (X = X.sibling));
		}
		function w8(B, X) {
			var G = null;
			(B !== null &&
				B.memoizedState !== null &&
				B.memoizedState.cachePool !== null &&
				(G = B.memoizedState.cachePool.pool),
				(B = null),
				X.memoizedState !== null &&
					X.memoizedState.cachePool !== null &&
					(B = X.memoizedState.cachePool.pool),
				B !== G && (B != null && G1(B), G != null && B3(G)));
		}
		function K8(B, X) {
			((B = null),
				X.alternate !== null && (B = X.alternate.memoizedState.cache),
				(X = X.memoizedState.cache),
				X !== B && (G1(X), B != null && B3(B)));
		}
		function b5(B, X, G, Z, Y) {
			if (
				X.subtreeFlags & 10256 ||
				(X.actualDuration !== 0 && (X.alternate === null || X.alternate.child !== X.child))
			)
				for (X = X.child; X !== null;) {
					var $ = X.sibling;
					(tR(B, X, G, Z, $ !== null ? $.actualStartTime : Y), (X = $));
				}
		}
		function tR(B, X, G, Z, Y) {
			var $ = Y5(),
				R = e5(),
				z = X6(),
				H = G6(),
				J = _B,
				w = X.flags;
			switch (X.tag) {
				case 0:
				case 11:
				case 15:
					((X.mode & e) !== p &&
						0 < X.actualStartTime &&
						(X.flags & 1) !== 0 &&
						g4(X, X.actualStartTime, Y, M2, G),
						b5(B, X, G, Z, Y),
						w & 2048 && gR(X, u2 | D5));
					break;
				case 1:
					((X.mode & e) !== p &&
						0 < X.actualStartTime &&
						((X.flags & 128) !== 0
							? e9(X, X.actualStartTime, Y, [])
							: (X.flags & 1) !== 0 && g4(X, X.actualStartTime, Y, M2, G)),
						b5(B, X, G, Z, Y));
					break;
				case 3:
					var K = D6(),
						M = M2;
					((M2 =
						X.alternate !== null &&
						X.alternate.memoizedState.isDehydrated &&
						(X.flags & 256) === 0),
						b5(B, X, G, Z, Y),
						(M2 = M),
						w & 2048 &&
							((G = null),
							X.alternate !== null && (G = X.alternate.memoizedState.cache),
							(Z = X.memoizedState.cache),
							Z !== G && (G1(Z), G != null && B3(G))),
						(B.passiveEffectDuration += s4(K)));
					break;
				case 12:
					if (w & 2048) {
						((w = D6()), b5(B, X, G, Z, Y), (B = X.stateNode), (B.passiveEffectDuration += X3(w)));
						try {
							k(X, UM, X, X.alternate, FB, B.passiveEffectDuration);
						} catch (_) {
							_0(X, X.return, _);
						}
					} else b5(B, X, G, Z, Y);
					break;
				case 31:
					((w = M2),
						(K = X.alternate !== null ? X.alternate.memoizedState : null),
						(M = X.memoizedState),
						K !== null && M === null
							? ((M = X.deletions),
								M !== null && 0 < M.length && M[0].tag === 18
									? ((M2 = !1),
										(K = K.hydrationErrors),
										K !== null && e9(X, X.actualStartTime, Y, K))
									: (M2 = !0))
							: (M2 = !1),
						b5(B, X, G, Z, Y),
						(M2 = w));
					break;
				case 13:
					((w = M2),
						(K = X.alternate !== null ? X.alternate.memoizedState : null),
						(M = X.memoizedState),
						K === null || K.dehydrated === null || (M !== null && M.dehydrated !== null)
							? (M2 = !1)
							: ((M = X.deletions),
								M !== null && 0 < M.length && M[0].tag === 18
									? ((M2 = !1),
										(K = K.hydrationErrors),
										K !== null && e9(X, X.actualStartTime, Y, K))
									: (M2 = !0)),
						b5(B, X, G, Z, Y),
						(M2 = w));
					break;
				case 23:
					break;
				case 22:
					((M = X.stateNode),
						(K = X.alternate),
						X.memoizedState !== null
							? M._visibility & b6
								? b5(B, X, G, Z, Y)
								: W3(B, X, G, Z, Y)
							: M._visibility & b6
								? b5(B, X, G, Z, Y)
								: ((M._visibility |= b6),
									n1(
										B,
										X,
										G,
										Z,
										(X.subtreeFlags & 10256) !== 0 ||
											(X.actualDuration !== 0 &&
												(X.alternate === null || X.alternate.child !== X.child)),
										Y,
									),
									(X.mode & e) === p ||
										M2 ||
										((B = X.actualStartTime),
										0 <= B && 0.05 < Y - B && S4(X, B, Y),
										0 <= u && 0 <= s && 0.05 < s - u && S4(X, u, s))),
						w & 2048 && w8(K, X));
					break;
				case 24:
					(b5(B, X, G, Z, Y), w & 2048 && K8(X.alternate, X));
					break;
				default:
					b5(B, X, G, Z, Y);
			}
			if ((X.mode & e) !== p) {
				if ((B = !M2 && X.alternate === null && X.return !== null && X.return.alternate !== null))
					((G = X.actualStartTime), 0 <= G && 0.05 < Y - G && i5(X, G, Y, 'Mount'));
				0 <= u &&
					0 <= s &&
					((i0 || 0.05 < c0) && t5(X, u, s, c0, s0), B && 0.05 < s - u && i5(X, u, s, 'Mount'));
			}
			($5($), B6(R), (s0 = z), (i0 = H), (_B = J));
		}
		function n1(B, X, G, Z, Y, $) {
			Y =
				Y &&
				((X.subtreeFlags & 10256) !== 0 ||
					(X.actualDuration !== 0 && (X.alternate === null || X.alternate.child !== X.child)));
			for (X = X.child; X !== null;) {
				var R = X.sibling;
				(rR(B, X, G, Z, Y, R !== null ? R.actualStartTime : $), (X = R));
			}
		}
		function rR(B, X, G, Z, Y, $) {
			var R = Y5(),
				z = e5(),
				H = X6(),
				J = G6(),
				w = _B;
			Y &&
				(X.mode & e) !== p &&
				0 < X.actualStartTime &&
				(X.flags & 1) !== 0 &&
				g4(X, X.actualStartTime, $, M2, G);
			var K = X.flags;
			switch (X.tag) {
				case 0:
				case 11:
				case 15:
					(n1(B, X, G, Z, Y, $), gR(X, u2));
					break;
				case 23:
					break;
				case 22:
					var M = X.stateNode;
					(X.memoizedState !== null
						? M._visibility & b6
							? n1(B, X, G, Z, Y, $)
							: W3(B, X, G, Z, $)
						: ((M._visibility |= b6), n1(B, X, G, Z, Y, $)),
						Y && K & 2048 && w8(X.alternate, X));
					break;
				case 24:
					(n1(B, X, G, Z, Y, $), Y && K & 2048 && K8(X.alternate, X));
					break;
				default:
					n1(B, X, G, Z, Y, $);
			}
			((X.mode & e) !== p && 0 <= u && 0 <= s && (i0 || 0.05 < c0) && t5(X, u, s, c0, s0),
				$5(R),
				B6(z),
				(s0 = H),
				(i0 = J),
				(_B = w));
		}
		function W3(B, X, G, Z, Y) {
			if (
				X.subtreeFlags & 10256 ||
				(X.actualDuration !== 0 && (X.alternate === null || X.alternate.child !== X.child))
			)
				for (var $ = X.child; $ !== null;) {
					X = $.sibling;
					var R = B,
						z = G,
						H = Z,
						J = X !== null ? X.actualStartTime : Y,
						w = _B;
					($.mode & e) !== p &&
						0 < $.actualStartTime &&
						($.flags & 1) !== 0 &&
						g4($, $.actualStartTime, J, M2, z);
					var K = $.flags;
					switch ($.tag) {
						case 22:
							(W3(R, $, z, H, J), K & 2048 && w8($.alternate, $));
							break;
						case 24:
							(W3(R, $, z, H, J), K & 2048 && K8($.alternate, $));
							break;
						default:
							W3(R, $, z, H, J);
					}
					((_B = w), ($ = X));
				}
		}
		function i1(B, X, G) {
			if (B.subtreeFlags & Y4) for (B = B.child; B !== null;) (eR(B, X, G), (B = B.sibling));
		}
		function eR(B, X, G) {
			switch (B.tag) {
				case 26:
					(i1(B, X, G),
						B.flags & Y4 &&
							B.memoizedState !== null &&
							Xq(G, d5, B.memoizedState, B.memoizedProps));
					break;
				case 5:
					i1(B, X, G);
					break;
				case 3:
				case 4:
					var Z = d5;
					((d5 = N7(B.stateNode.containerInfo)), i1(B, X, G), (d5 = Z));
					break;
				case 22:
					B.memoizedState === null &&
						((Z = B.alternate),
						Z !== null && Z.memoizedState !== null
							? ((Z = Y4), (Y4 = 16777216), i1(B, X, G), (Y4 = Z))
							: i1(B, X, G));
					break;
				default:
					i1(B, X, G);
			}
		}
		function Bz(B) {
			var X = B.alternate;
			if (X !== null && ((B = X.child), B !== null)) {
				X.child = null;
				do ((X = B.sibling), (B.sibling = null), (B = X));
				while (B !== null);
			}
		}
		function w3(B) {
			var X = B.deletions;
			if ((B.flags & 16) !== 0) {
				if (X !== null)
					for (var G = 0; G < X.length; G++) {
						var Z = X[G],
							Y = Y5();
						((_2 = Z),
							Zz(Z, B),
							(Z.mode & e) !== p && 0 <= u && 0 <= s && 0.05 < s - u && i5(Z, u, s, 'Unmount'),
							$5(Y));
					}
				Bz(B);
			}
			if (B.subtreeFlags & 10256) for (B = B.child; B !== null;) (Xz(B), (B = B.sibling));
		}
		function Xz(B) {
			var X = Y5(),
				G = e5(),
				Z = X6(),
				Y = G6();
			switch (B.tag) {
				case 0:
				case 11:
				case 15:
					(w3(B), B.flags & 2048 && Q8(B, B.return, u2 | D5));
					break;
				case 3:
					var $ = D6();
					(w3(B), (B.stateNode.passiveEffectDuration += s4($)));
					break;
				case 12:
					(($ = D6()), w3(B), (B.stateNode.passiveEffectDuration += X3($)));
					break;
				case 22:
					(($ = B.stateNode),
						B.memoizedState !== null &&
						$._visibility & b6 &&
						(B.return === null || B.return.tag !== 13)
							? (($._visibility &= ~b6),
								_7(B),
								(B.mode & e) !== p && 0 <= u && 0 <= s && 0.05 < s - u && i5(B, u, s, 'Disconnect'))
							: w3(B));
					break;
				default:
					w3(B);
			}
			((B.mode & e) !== p && 0 <= u && 0 <= s && (i0 || 0.05 < c0) && t5(B, u, s, c0, s0),
				$5(X),
				B6(G),
				(i0 = Y),
				(s0 = Z));
		}
		function _7(B) {
			var X = B.deletions;
			if ((B.flags & 16) !== 0) {
				if (X !== null)
					for (var G = 0; G < X.length; G++) {
						var Z = X[G],
							Y = Y5();
						((_2 = Z),
							Zz(Z, B),
							(Z.mode & e) !== p && 0 <= u && 0 <= s && 0.05 < s - u && i5(Z, u, s, 'Unmount'),
							$5(Y));
					}
				Bz(B);
			}
			for (B = B.child; B !== null;) (Gz(B), (B = B.sibling));
		}
		function Gz(B) {
			var X = Y5(),
				G = e5(),
				Z = X6(),
				Y = G6();
			switch (B.tag) {
				case 0:
				case 11:
				case 15:
					(Q8(B, B.return, u2), _7(B));
					break;
				case 22:
					var $ = B.stateNode;
					$._visibility & b6 && (($._visibility &= ~b6), _7(B));
					break;
				default:
					_7(B);
			}
			((B.mode & e) !== p && 0 <= u && 0 <= s && (i0 || 0.05 < c0) && t5(B, u, s, c0, s0),
				$5(X),
				B6(G),
				(i0 = Y),
				(s0 = Z));
		}
		function Zz(B, X) {
			for (; _2 !== null;) {
				var G = _2,
					Z = G,
					Y = X,
					$ = Y5(),
					R = e5(),
					z = X6(),
					H = G6();
				switch (Z.tag) {
					case 0:
					case 11:
					case 15:
						Q8(Z, Y, u2);
						break;
					case 23:
					case 22:
						Z.memoizedState !== null &&
							Z.memoizedState.cachePool !== null &&
							((Y = Z.memoizedState.cachePool.pool), Y != null && G1(Y));
						break;
					case 24:
						B3(Z.memoizedState.cache);
				}
				if (
					((Z.mode & e) !== p && 0 <= u && 0 <= s && (i0 || 0.05 < c0) && t5(Z, u, s, c0, s0),
					$5($),
					B6(R),
					(i0 = H),
					(s0 = z),
					(Z = G.child),
					Z !== null)
				)
					((Z.return = G), (_2 = Z));
				else
					B: for (G = B; _2 !== null;) {
						if (((Z = _2), ($ = Z.sibling), (R = Z.return), sR(Z), Z === G)) {
							_2 = null;
							break B;
						}
						if ($ !== null) {
							(($.return = R), (_2 = $));
							break B;
						}
						_2 = R;
					}
			}
		}
		function WM() {
			kW.forEach(function (B) {
				return B();
			});
		}
		function Yz() {
			var B = typeof IS_REACT_ACT_ENVIRONMENT < 'u' ? IS_REACT_ACT_ENVIRONMENT : void 0;
			return (
				B ||
					A.actQueue === null ||
					console.error('The current testing environment is not configured to support act(...)'),
				B
			);
		}
		function z5(B) {
			if ((M0 & q2) !== L2 && X0 !== 0) return X0 & -X0;
			var X = A.T;
			return X !== null
				? (X._updatedFibers || (X._updatedFibers = new Set()), X._updatedFibers.add(B), x8())
				: O();
		}
		function $z() {
			if (o2 === 0)
				if ((X0 & 536870912) === 0 || H0) {
					var B = m7;
					((m7 <<= 1), (m7 & 3932160) === 0 && (m7 = 262144), (o2 = B));
				} else o2 = 536870912;
			return ((B = q5.current), B !== null && (B.flags |= 32), o2);
		}
		function n0(B, X, G) {
			if (
				(kX && console.error('useInsertionEffect must not schedule updates.'),
				$Y && (F9 = !0),
				(B === S0 && (N0 === F1 || N0 === P1)) || B.cancelPendingCommit !== null)
			)
				(r1(B, 0), UB(B, X0, o2, !1));
			if ((r6(B, G), (M0 & q2) !== L2 && B === S0)) {
				if (q6)
					switch (X.tag) {
						case 0:
						case 11:
						case 15:
							((B = (G0 && v(G0)) || 'Unknown'),
								vU.has(B) ||
									(vU.add(B),
									(X = v(X) || 'Unknown'),
									console.error(
										'Cannot update a component (`%s`) while rendering a different component (`%s`). To locate the bad setState() call inside `%s`, follow the stack trace as described in https://react.dev/link/setstate-in-render',
										X,
										B,
										B,
									)));
							break;
						case 1:
							TU ||
								(console.error(
									'Cannot update during an existing state transition (such as within `render`). Render methods should be a pure function of props and state.',
								),
								(TU = !0));
					}
			} else
				(w6 && sX(B, X, G),
					xM(X),
					B === S0 && ((M0 & q2) === L2 && (TB |= G), a0 === VB && UB(B, X0, o2, !1)),
					J6(B));
		}
		function Rz(B, X, G) {
			if ((M0 & (q2 | w5)) !== L2) throw Error('Should not already be working.');
			if (X0 !== 0 && G0 !== null) {
				var Z = G0,
					Y = K2();
				switch (xJ) {
					case z4:
					case F1:
						var $ = l3;
						y0 &&
							((Z = Z._debugTask)
								? Z.run(
										console.timeStamp.bind(console, 'Suspended', $, Y, F5, void 0, 'primary-light'),
									)
								: console.timeStamp('Suspended', $, Y, F5, void 0, 'primary-light'));
						break;
					case P1:
						(($ = l3),
							y0 &&
								((Z = Z._debugTask)
									? Z.run(
											console.timeStamp.bind(console, 'Action', $, Y, F5, void 0, 'primary-light'),
										)
									: console.timeStamp('Action', $, Y, F5, void 0, 'primary-light')));
						break;
					default:
						y0 &&
							((Z = Y - l3),
							3 > Z ||
								console.timeStamp(
									'Blocked',
									l3,
									Y,
									F5,
									void 0,
									5 > Z ? 'primary-light' : 10 > Z ? 'primary' : 100 > Z ? 'primary-dark' : 'error',
								));
				}
			}
			$ = (G = (!G && (X & 127) === 0 && (X & B.expiredLanes) === 0) || sB(B, X))
				? KM(B, X)
				: _8(B, X, !0);
			var R = G;
			do {
				if ($ === a6) {
					(SX && !G && UB(B, X, 0, !1), (X = N0), (l3 = Y2()), (xJ = X));
					break;
				} else {
					if (((Z = K2()), (Y = B.current.alternate), R && !wM(Y))) {
						(G5(X),
							(Y = O2),
							($ = Z),
							!y0 ||
								$ <= Y ||
								(r0
									? r0.run(console.timeStamp.bind(console, 'Teared Render', Y, $, R0, $0, 'error'))
									: console.timeStamp('Teared Render', Y, $, R0, $0, 'error')),
							H1(X, Z),
							($ = _8(B, X, !1)),
							(R = !1));
						continue;
					}
					if ($ === j1) {
						if (((R = X), B.errorRecoveryDisabledLanes & R)) var z = 0;
						else
							((z = B.pendingLanes & -536870913),
								(z = z !== 0 ? z : z & 536870912 ? 536870912 : 0));
						if (z !== 0) {
							(G5(X), BG(O2, Z, X, r0), H1(X, Z), (X = z));
							B: {
								((Z = B), ($ = R), (R = J4));
								var H = Z.current.memoizedState.isDehydrated;
								if ((H && (r1(Z, z).flags |= 256), (z = _8(Z, z, !1)), z !== j1)) {
									if (tZ && !H) {
										((Z.errorRecoveryDisabledLanes |= $), (TB |= $), ($ = VB));
										break B;
									}
									((Z = h2),
										(h2 = R),
										Z !== null && (h2 === null ? (h2 = Z) : h2.push.apply(h2, Z)));
								}
								$ = z;
							}
							if (((R = !1), $ !== j1)) continue;
							else Z = K2();
						}
					}
					if ($ === R4) {
						(G5(X), BG(O2, Z, X, r0), H1(X, Z), r1(B, 0), UB(B, X, 0, !0));
						break;
					}
					B: {
						switch (((G = B), $)) {
							case a6:
							case R4:
								throw Error('Root did not complete. This is a bug in React.');
							case VB:
								if ((X & 4194048) !== X) break;
							case W9:
								(G5(X),
									R$(O2, Z, X, r0),
									H1(X, Z),
									(Y = X),
									(Y & 127) !== 0 ? (e7 = Z) : (Y & 4194048) !== 0 && (B9 = Z),
									UB(G, X, o2, !CB));
								break B;
							case j1:
								h2 = null;
								break;
							case q9:
							case _U:
								break;
							default:
								throw Error('Unknown root exit status.');
						}
						if (A.actQueue !== null) L8(G, Y, X, h2, U4, O9, o2, TB, x1, $, null, null, O2, Z);
						else {
							if ((X & 62914560) === X && ((R = _9 + jU - K2()), 10 < R)) {
								if ((UB(G, X, o2, !CB), dB(G, 0, !0) !== 0)) break B;
								((s5 = X),
									(G.timeoutHandle = uU(
										zz.bind(null, G, Y, h2, U4, O9, X, o2, TB, x1, CB, $, 'Throttled', O2, Z),
										R,
									)));
								break B;
							}
							zz(G, Y, h2, U4, O9, X, o2, TB, x1, CB, $, null, O2, Z);
						}
					}
				}
				break;
			} while (1);
			J6(B);
		}
		function zz(B, X, G, Z, Y, $, R, z, H, J, w, K, M, _) {
			B.timeoutHandle = C1;
			var V = X.subtreeFlags,
				S = null;
			if (V & 8192 || (V & 16785408) === 16785408) {
				if (
					((S = {
						stylesheets: null,
						count: 0,
						imgCount: 0,
						imgBytes: 0,
						suspenseyImages: [],
						waitingForImages: !0,
						waitingForViewTransition: !1,
						unsuspend: E6,
					}),
					eR(X, $, S),
					(V = ($ & 62914560) === $ ? _9 - K2() : ($ & 4194048) === $ ? AU - K2() : 0),
					(V = Gq(S, V)),
					V !== null)
				) {
					((s5 = $),
						(B.cancelPendingCommit = V(
							L8.bind(
								null,
								B,
								X,
								$,
								G,
								Z,
								Y,
								R,
								z,
								H,
								w,
								S,
								S.waitingForViewTransition
									? 'Waiting for the previous Animation'
									: 0 < S.count
										? 0 < S.imgCount
											? 'Suspended on CSS and Images'
											: 'Suspended on CSS'
										: S.imgCount === 1
											? 'Suspended on an Image'
											: 0 < S.imgCount
												? 'Suspended on Images'
												: null,
								M,
								_,
							),
						)),
						UB(B, $, R, !J));
					return;
				}
			}
			L8(B, X, $, G, Z, Y, R, z, H, w, S, K, M, _);
		}
		function wM(B) {
			for (var X = B; ;) {
				var G = X.tag;
				if (
					(G === 0 || G === 11 || G === 15) &&
					X.flags & 16384 &&
					((G = X.updateQueue), G !== null && ((G = G.stores), G !== null))
				)
					for (var Z = 0; Z < G.length; Z++) {
						var Y = G[Z],
							$ = Y.getSnapshot;
						Y = Y.value;
						try {
							if (!m2($(), Y)) return !1;
						} catch (R) {
							return !1;
						}
					}
				if (((G = X.child), X.subtreeFlags & 16384 && G !== null)) ((G.return = X), (X = G));
				else {
					if (X === B) break;
					for (; X.sibling === null;) {
						if (X.return === null || X.return === B) return !0;
						X = X.return;
					}
					((X.sibling.return = X.return), (X = X.sibling));
				}
			}
			return !0;
		}
		function UB(B, X, G, Z) {
			((X &= ~rZ),
				(X &= ~TB),
				(B.suspendedLanes |= X),
				(B.pingedLanes &= ~X),
				Z && (B.warmLanes |= X),
				(Z = B.expirationTimes));
			for (var Y = X; 0 < Y;) {
				var $ = 31 - g2(Y),
					R = 1 << $;
				((Z[$] = -1), (Y &= ~R));
			}
			G !== 0 && lB(B, G, X);
		}
		function t1() {
			return (M0 & (q2 | w5)) === L2 ? (_3(0, !1), !1) : !0;
		}
		function O8() {
			if (G0 !== null) {
				if (N0 === a2) var B = G0.return;
				else ((B = G0), u4(), VG(B), (xX = null), (e3 = 0), (B = G0));
				for (; B !== null;) (vR(B.alternate, B), (B = B.return));
				G0 = null;
			}
		}
		function H1(B, X) {
			((B & 127) !== 0 && (PB = X),
				(B & 4194048) !== 0 && (A6 = X),
				(B & 62914560) !== 0 && (FJ = X),
				(B & 2080374784) !== 0 && (PJ = X));
		}
		function r1(B, X) {
			y0 &&
				(console.timeStamp('Blocking Track', 0.003, 0.003, 'Blocking', $0, 'primary-light'),
				console.timeStamp('Transition Track', 0.003, 0.003, 'Transition', $0, 'primary-light'),
				console.timeStamp('Suspense Track', 0.003, 0.003, 'Suspense', $0, 'primary-light'),
				console.timeStamp('Idle Track', 0.003, 0.003, 'Idle', $0, 'primary-light'));
			var G = O2;
			if (((O2 = Y2()), X0 !== 0 && 0 < G)) {
				if ((G5(X0), a0 === q9 || a0 === VB)) R$(G, O2, X, r0);
				else {
					var Z = O2,
						Y = r0;
					if (y0 && !(Z <= G)) {
						var $ = (X & 738197653) === X ? 'tertiary-dark' : 'primary-dark',
							R =
								(X & 536870912) === X
									? 'Prewarm'
									: (X & 201326741) === X
										? 'Interrupted Hydration'
										: 'Interrupted Render';
						Y
							? Y.run(console.timeStamp.bind(console, R, G, Z, R0, $0, $))
							: console.timeStamp(R, G, Z, R0, $0, $);
					}
				}
				H1(X0, O2);
			}
			if (((G = r0), (r0 = null), (X & 127) !== 0)) {
				((r0 = h3),
					(Y = 0 <= L6 && L6 < PB ? PB : L6),
					(Z = 0 <= q1 && q1 < PB ? PB : q1),
					($ = 0 <= Z ? Z : 0 <= Y ? Y : O2),
					0 <= e7 ? (G5(2), z$(e7, $, X, G)) : (X9 & 127) !== 0 && (G5(2), rX(PB, $, d6)),
					(G = Y));
				var z = Z,
					H = d3,
					J = 0 < jX,
					w = xB === u3,
					K = xB === r7;
				if (((Y = O2), (Z = h3), ($ = DZ), (R = TZ), y0)) {
					if (
						((R0 = 'Blocking'),
						0 < G ? G > Y && (G = Y) : (G = Y),
						0 < z ? z > G && (z = G) : (z = G),
						H !== null && G > z)
					) {
						var M = J ? 'secondary-light' : 'warning';
						Z
							? Z.run(
									console.timeStamp.bind(
										console,
										J ? 'Consecutive' : 'Event: ' + H,
										z,
										G,
										R0,
										$0,
										M,
									),
								)
							: console.timeStamp(J ? 'Consecutive' : 'Event: ' + H, z, G, R0, $0, M);
					}
					Y > G &&
						((z = w ? 'error' : (X & 738197653) === X ? 'tertiary-light' : 'primary-light'),
						(w = K
							? 'Promise Resolved'
							: w
								? 'Cascading Update'
								: 5 < Y - G
									? 'Update Blocked'
									: 'Update'),
						(K = []),
						R != null && K.push(['Component name', R]),
						$ != null && K.push(['Method name', $]),
						(G = {
							start: G,
							end: Y,
							detail: { devtools: { properties: K, track: R0, trackGroup: $0, color: z } },
						}),
						Z ? Z.run(performance.measure.bind(performance, w, G)) : performance.measure(w, G));
				}
				((L6 = -1.1), (xB = 0), (TZ = DZ = null), (e7 = -1.1), (jX = q1), (q1 = -1.1), (PB = Y2()));
			}
			if (
				((X & 4194048) !== 0 &&
					((r0 = s3),
					(Y = 0 <= h6 && h6 < A6 ? A6 : h6),
					(G = 0 <= V5 && V5 < A6 ? A6 : V5),
					(Z = 0 <= NB && NB < A6 ? A6 : NB),
					($ = 0 <= Z ? Z : 0 <= G ? G : O2),
					0 <= B9 ? (G5(256), z$(B9, $, X, r0)) : (X9 & 4194048) !== 0 && (G5(256), rX(A6, $, d6)),
					(K = Z),
					(z = W1),
					(H = 0 < EB),
					(J = vZ === r7),
					($ = O2),
					(Z = s3),
					(R = AJ),
					(w = jJ),
					y0 &&
						((R0 = 'Transition'),
						0 < G ? G > $ && (G = $) : (G = $),
						0 < Y ? Y > G && (Y = G) : (Y = G),
						0 < K ? K > Y && (K = Y) : (K = Y),
						Y > K &&
							z !== null &&
							((M = H ? 'secondary-light' : 'warning'),
							Z
								? Z.run(
										console.timeStamp.bind(
											console,
											H ? 'Consecutive' : 'Event: ' + z,
											K,
											Y,
											R0,
											$0,
											M,
										),
									)
								: console.timeStamp(H ? 'Consecutive' : 'Event: ' + z, K, Y, R0, $0, M)),
						G > Y &&
							(Z
								? Z.run(console.timeStamp.bind(console, 'Action', Y, G, R0, $0, 'primary-dark'))
								: console.timeStamp('Action', Y, G, R0, $0, 'primary-dark')),
						$ > G &&
							((Y = J ? 'Promise Resolved' : 5 < $ - G ? 'Update Blocked' : 'Update'),
							(K = []),
							w != null && K.push(['Component name', w]),
							R != null && K.push(['Method name', R]),
							(G = {
								start: G,
								end: $,
								detail: {
									devtools: { properties: K, track: R0, trackGroup: $0, color: 'primary-light' },
								},
							}),
							Z ? Z.run(performance.measure.bind(performance, Y, G)) : performance.measure(Y, G))),
					(V5 = h6 = -1.1),
					(vZ = 0),
					(B9 = -1.1),
					(EB = NB),
					(NB = -1.1),
					(A6 = Y2())),
				(X & 62914560) !== 0 && (X9 & 62914560) !== 0 && (G5(4194304), rX(FJ, O2, d6)),
				(X & 2080374784) !== 0 && (X9 & 2080374784) !== 0 && (G5(268435456), rX(PJ, O2, d6)),
				(G = B.timeoutHandle),
				G !== C1 && ((B.timeoutHandle = C1), oW(G)),
				(G = B.cancelPendingCommit),
				G !== null && ((B.cancelPendingCommit = null), G()),
				(s5 = 0),
				O8(),
				(S0 = B),
				(G0 = G = I6(B.current, null)),
				(X0 = X),
				(N0 = a2),
				(K5 = null),
				(CB = !1),
				(SX = sB(B, X)),
				(tZ = !1),
				(a0 = a6),
				(x1 = o2 = rZ = TB = DB = 0),
				(h2 = J4 = null),
				(O9 = !1),
				(X & 8) !== 0 && (X |= X & 32),
				(Z = B.entangledLanes),
				Z !== 0)
			)
				for (B = B.entanglements, Z &= X; 0 < Z;)
					((Y = 31 - g2(Z)), ($ = 1 << Y), (X |= B[Y]), (Z &= ~$));
			return (
				(F6 = X),
				k4(),
				(B = WJ()),
				1000 < B - qJ && ((A.recentlyCreatedOwnerStacks = 0), (qJ = B)),
				u5.discardPendingWarnings(),
				G
			);
		}
		function Hz(B, X) {
			((c = null),
				(A.H = Z4),
				(A.getCurrentStack = null),
				(q6 = !1),
				(U5 = null),
				X === PX || X === $9
					? ((X = C$()), (N0 = z4))
					: X === bZ
						? ((X = C$()), (N0 = LU))
						: (N0 =
								X === cZ
									? iZ
									: X !== null && typeof X === 'object' && typeof X.then === 'function'
										? H4
										: w9),
				(K5 = X));
			var G = G0;
			G === null ? ((a0 = R4), Q7(B, Z5(X, B.current))) : G.mode & e && wG(G);
		}
		function Jz() {
			var B = q5.current;
			return B === null
				? !0
				: (X0 & 4194048) === X0
					? C5 === null
						? !0
						: !1
					: (X0 & 62914560) === X0 || (X0 & 536870912) !== 0
						? B === C5
						: !1;
		}
		function Uz() {
			var B = A.H;
			return ((A.H = Z4), B === null ? Z4 : B);
		}
		function Qz() {
			var B = A.A;
			return ((A.A = gW), B);
		}
		function L7(B) {
			r0 === null && (r0 = B._debugTask == null ? null : B._debugTask);
		}
		function A7() {
			((a0 = VB),
				CB || ((X0 & 4194048) !== X0 && q5.current !== null) || (SX = !0),
				((DB & 134217727) === 0 && (TB & 134217727) === 0) || S0 === null || UB(S0, X0, o2, !1));
		}
		function _8(B, X, G) {
			var Z = M0;
			M0 |= q2;
			var Y = Uz(),
				$ = Qz();
			if (S0 !== B || X0 !== X) {
				if (w6) {
					var R = B.memoizedUpdaters;
					(0 < R.size && (O3(B, X0), R.clear()), e6(B, X));
				}
				((U4 = null), r1(B, X));
			}
			((X = !1), (R = a0));
			B: do
				try {
					if (N0 !== a2 && G0 !== null) {
						var z = G0,
							H = K5;
						switch (N0) {
							case iZ:
								(O8(), (R = W9));
								break B;
							case z4:
							case F1:
							case P1:
							case H4:
								q5.current === null && (X = !0);
								var J = N0;
								if (((N0 = a2), (K5 = null), e1(B, z, H, J), G && SX)) {
									R = a6;
									break B;
								}
								break;
							default:
								((J = N0), (N0 = a2), (K5 = null), e1(B, z, H, J));
						}
					}
					(Mz(), (R = a0));
					break;
				} catch (w) {
					Hz(B, w);
				}
			while (1);
			return (
				X && B.shellSuspendCounter++,
				u4(),
				(M0 = Z),
				(A.H = Y),
				(A.A = $),
				G0 === null && ((S0 = null), (X0 = 0), k4()),
				R
			);
		}
		function Mz() {
			for (; G0 !== null;) qz(G0);
		}
		function KM(B, X) {
			var G = M0;
			M0 |= q2;
			var Z = Uz(),
				Y = Qz();
			if (S0 !== B || X0 !== X) {
				if (w6) {
					var $ = B.memoizedUpdaters;
					(0 < $.size && (O3(B, X0), $.clear()), e6(B, X));
				}
				((U4 = null), (L9 = K2() + FU), r1(B, X));
			} else SX = sB(B, X);
			B: do
				try {
					if (N0 !== a2 && G0 !== null)
						X: switch (((X = G0), ($ = K5), N0)) {
							case w9:
								((N0 = a2), (K5 = null), e1(B, X, $, w9));
								break;
							case F1:
							case P1:
								if (I$($)) {
									((N0 = a2), (K5 = null), Wz(X));
									break;
								}
								((X = function () {
									((N0 !== F1 && N0 !== P1) || S0 !== B || (N0 = K9), J6(B));
								}),
									$.then(X, X));
								break B;
							case z4:
								N0 = K9;
								break B;
							case LU:
								N0 = nZ;
								break B;
							case K9:
								I$($) ? ((N0 = a2), (K5 = null), Wz(X)) : ((N0 = a2), (K5 = null), e1(B, X, $, K9));
								break;
							case nZ:
								var R = null;
								switch (G0.tag) {
									case 26:
										R = G0.memoizedState;
									case 5:
									case 27:
										var z = G0;
										if (R ? RH(R) : z.stateNode.complete) {
											((N0 = a2), (K5 = null));
											var H = z.sibling;
											if (H !== null) G0 = H;
											else {
												var J = z.return;
												J !== null ? ((G0 = J), j7(J)) : (G0 = null);
											}
											break X;
										}
										break;
									default:
										console.error(
											'Unexpected type of fiber triggered a suspensey commit. This is a bug in React.',
										);
								}
								((N0 = a2), (K5 = null), e1(B, X, $, nZ));
								break;
							case H4:
								((N0 = a2), (K5 = null), e1(B, X, $, H4));
								break;
							case iZ:
								(O8(), (a0 = W9));
								break B;
							default:
								throw Error('Unexpected SuspendedReason. This is a bug in React.');
						}
					A.actQueue !== null ? Mz() : OM();
					break;
				} catch (w) {
					Hz(B, w);
				}
			while (1);
			if ((u4(), (A.H = Z), (A.A = Y), (M0 = G), G0 !== null)) return a6;
			return ((S0 = null), (X0 = 0), k4(), a0);
		}
		function OM() {
			for (; G0 !== null && !wq();) qz(G0);
		}
		function qz(B) {
			var X = B.alternate;
			((B.mode & e) !== p ? (WG(B), (X = k(B, H8, X, B, F6)), wG(B)) : (X = k(B, H8, X, B, F6)),
				(B.memoizedProps = B.pendingProps),
				X === null ? j7(B) : (G0 = X));
		}
		function Wz(B) {
			var X = k(B, _M, B);
			((B.memoizedProps = B.pendingProps), X === null ? j7(B) : (G0 = X));
		}
		function _M(B) {
			var X = B.alternate,
				G = (B.mode & e) !== p;
			switch ((G && WG(B), B.tag)) {
				case 15:
				case 0:
					X = NR(X, B, B.pendingProps, B.type, void 0, X0);
					break;
				case 11:
					X = NR(X, B, B.pendingProps, B.type.render, B.ref, X0);
					break;
				case 5:
					VG(B);
				default:
					(vR(X, B), (B = G0 = q$(B, F6)), (X = H8(X, B, F6)));
			}
			return (G && wG(B), X);
		}
		function e1(B, X, G, Z) {
			(u4(), VG(X), (xX = null), (e3 = 0));
			var Y = X.return;
			try {
				if (GM(B, Y, X, G, X0)) {
					((a0 = R4), Q7(B, Z5(G, B.current)), (G0 = null));
					return;
				}
			} catch ($) {
				if (Y !== null) throw ((G0 = Y), $);
				((a0 = R4), Q7(B, Z5(G, B.current)), (G0 = null));
				return;
			}
			if (X.flags & 32768) {
				if (H0 || Z === w9) B = !0;
				else if (SX || (X0 & 536870912) !== 0) B = !1;
				else if (((CB = B = !0), Z === F1 || Z === P1 || Z === z4 || Z === H4))
					((Z = q5.current), Z !== null && Z.tag === 13 && (Z.flags |= 16384));
				wz(X, B);
			} else j7(X);
		}
		function j7(B) {
			var X = B;
			do {
				if ((X.flags & 32768) !== 0) {
					wz(X, CB);
					return;
				}
				var G = X.alternate;
				if (
					((B = X.return), WG(X), (G = k(X, $M, G, X, F6)), (X.mode & e) !== p && F$(X), G !== null)
				) {
					G0 = G;
					return;
				}
				if (((X = X.sibling), X !== null)) {
					G0 = X;
					return;
				}
				G0 = X = B;
			} while (X !== null);
			a0 === a6 && (a0 = _U);
		}
		function wz(B, X) {
			do {
				var G = RM(B.alternate, B);
				if (G !== null) {
					((G.flags &= 32767), (G0 = G));
					return;
				}
				if ((B.mode & e) !== p) {
					(F$(B), (G = B.actualDuration));
					for (var Z = B.child; Z !== null;) ((G += Z.actualDuration), (Z = Z.sibling));
					B.actualDuration = G;
				}
				if (
					((G = B.return),
					G !== null && ((G.flags |= 32768), (G.subtreeFlags = 0), (G.deletions = null)),
					!X && ((B = B.sibling), B !== null))
				) {
					G0 = B;
					return;
				}
				G0 = B = G;
			} while (B !== null);
			((a0 = W9), (G0 = null));
		}
		function L8(B, X, G, Z, Y, $, R, z, H, J, w, K, M, _) {
			B.cancelPendingCommit = null;
			do K3();
			while (J2 !== SB);
			if (
				(u5.flushLegacyContextWarning(),
				u5.flushPendingUnsafeLifecycleWarnings(),
				(M0 & (q2 | w5)) !== L2)
			)
				throw Error('Should not already be working.');
			if (
				(G5(G),
				J === j1
					? BG(M, _, G, r0)
					: Z !== null
						? sQ(
								M,
								_,
								G,
								Z,
								X !== null &&
									X.alternate !== null &&
									X.alternate.memoizedState.isDehydrated &&
									(X.flags & 256) !== 0,
								r0,
							)
						: dQ(M, _, G, r0),
				X !== null)
			) {
				if (
					(G === 0 &&
						console.error(
							'finishedLanes should not be empty during a commit. This is a bug in React.',
						),
					X === B.current)
				)
					throw Error(
						'Cannot commit the same tree as before. This error is likely caused by a bug in React. Please file an issue.',
					);
				if (
					(($ = X.lanes | X.childLanes),
					($ |= NZ),
					x4(B, G, $, R, z, H),
					B === S0 && ((G0 = S0 = null), (X0 = 0)),
					(gX = X),
					(gB = B),
					(s5 = G),
					(XY = $),
					(ZY = Y),
					(VU = Z),
					(GY = _),
					(CU = K),
					(l5 = A9),
					(DU = null),
					X.actualDuration !== 0 || (X.subtreeFlags & 10256) !== 0 || (X.flags & 10256) !== 0
						? ((B.callbackNode = null),
							(B.callbackPriority = 0),
							PM($X, function () {
								return ((K4 = window.event), l5 === A9 && (l5 = BY), Az(), null);
							}))
						: ((B.callbackNode = null), (B.callbackPriority = 0)),
					(u6 = null),
					(FB = Y2()),
					K !== null && lQ(_, FB, K, r0),
					(Z = (X.flags & 13878) !== 0),
					(X.subtreeFlags & 13878) !== 0 || Z)
				) {
					((Z = A.T), (A.T = null), (Y = L0.p), (L0.p = Q5), (R = M0), (M0 |= w5));
					try {
						MM(B, X, G);
					} finally {
						((M0 = R), (L0.p = Y), (A.T = Z));
					}
				}
				((J2 = xU), Kz(), Oz(), _z());
			}
		}
		function Kz() {
			if (J2 === xU) {
				J2 = SB;
				var B = gB,
					X = gX,
					G = s5,
					Z = (X.flags & 13878) !== 0;
				if ((X.subtreeFlags & 13878) !== 0 || Z) {
					((Z = A.T), (A.T = null));
					var Y = L0.p;
					L0.p = Q5;
					var $ = M0;
					M0 |= w5;
					try {
						((TX = G), (vX = B), l4(), aR(X, B), (vX = TX = null), (G = WY));
						var R = Z$(B.containerInfo),
							z = G.focusedElem,
							H = G.selectionRange;
						if (R !== z && z && z.ownerDocument && G$(z.ownerDocument.documentElement, z)) {
							if (H !== null && t9(z)) {
								var { start: J, end: w } = H;
								if ((w === void 0 && (w = J), 'selectionStart' in z))
									((z.selectionStart = J), (z.selectionEnd = Math.min(w, z.value.length)));
								else {
									var K = z.ownerDocument || document,
										M = (K && K.defaultView) || window;
									if (M.getSelection) {
										var _ = M.getSelection(),
											V = z.textContent.length,
											S = Math.min(H.start, V),
											b0 = H.end === void 0 ? S : Math.min(H.end, V);
										!_.extend && S > b0 && ((R = b0), (b0 = S), (S = R));
										var Q0 = X$(z, S),
											Q = X$(z, b0);
										if (
											Q0 &&
											Q &&
											(_.rangeCount !== 1 ||
												_.anchorNode !== Q0.node ||
												_.anchorOffset !== Q0.offset ||
												_.focusNode !== Q.node ||
												_.focusOffset !== Q.offset)
										) {
											var q = K.createRange();
											(q.setStart(Q0.node, Q0.offset),
												_.removeAllRanges(),
												S > b0
													? (_.addRange(q), _.extend(Q.node, Q.offset))
													: (q.setEnd(Q.node, Q.offset), _.addRange(q)));
										}
									}
								}
							}
							K = [];
							for (_ = z; (_ = _.parentNode);)
								_.nodeType === 1 && K.push({ element: _, left: _.scrollLeft, top: _.scrollTop });
							typeof z.focus === 'function' && z.focus();
							for (z = 0; z < K.length; z++) {
								var W = K[z];
								((W.element.scrollLeft = W.left), (W.element.scrollTop = W.top));
							}
						}
						((b9 = !!qY), (WY = qY = null));
					} finally {
						((M0 = $), (L0.p = Y), (A.T = Z));
					}
				}
				((B.current = X), (J2 = NU));
			}
		}
		function Oz() {
			if (J2 === NU) {
				J2 = SB;
				var B = DU;
				if (B !== null) {
					FB = Y2();
					var X = f6,
						G = FB;
					!y0 ||
						G <= X ||
						(d6
							? d6.run(console.timeStamp.bind(console, B, X, G, R0, $0, 'secondary-light'))
							: console.timeStamp(B, X, G, R0, $0, 'secondary-light'));
				}
				((B = gB), (X = gX), (G = s5));
				var Z = (X.flags & 8772) !== 0;
				if ((X.subtreeFlags & 8772) !== 0 || Z) {
					((Z = A.T), (A.T = null));
					var Y = L0.p;
					L0.p = Q5;
					var $ = M0;
					M0 |= w5;
					try {
						((TX = G), (vX = B), l4(), dR(B, X.alternate, X), (vX = TX = null));
					} finally {
						((M0 = $), (L0.p = Y), (A.T = Z));
					}
				}
				((B = GY),
					(X = CU),
					(f6 = Y2()),
					(B = X === null ? B : FB),
					(X = f6),
					(G = l5 === eZ),
					(Z = r0),
					u6 !== null
						? H$(B, X, u6, !1, Z)
						: !y0 ||
							X <= B ||
							(Z
								? Z.run(
										console.timeStamp.bind(
											console,
											G ? 'Commit Interrupted View Transition' : 'Commit',
											B,
											X,
											R0,
											$0,
											G ? 'error' : 'secondary-dark',
										),
									)
								: console.timeStamp(
										G ? 'Commit Interrupted View Transition' : 'Commit',
										B,
										X,
										R0,
										$0,
										G ? 'error' : 'secondary-dark',
									)),
					(J2 = EU));
			}
		}
		function _z() {
			if (J2 === IU || J2 === EU) {
				if (J2 === IU) {
					var B = f6;
					f6 = Y2();
					var X = f6,
						G = l5 === eZ;
					(!y0 ||
						X <= B ||
						(d6
							? d6.run(
									console.timeStamp.bind(
										console,
										G ? 'Interrupted View Transition' : 'Starting Animation',
										B,
										X,
										R0,
										$0,
										G ? 'error' : 'secondary-light',
									),
								)
							: console.timeStamp(
									G ? 'Interrupted View Transition' : 'Starting Animation',
									B,
									X,
									R0,
									$0,
									G ? ' error' : 'secondary-light',
								)),
						l5 !== eZ && (l5 = PU));
				}
				((J2 = SB), Kq(), (B = gB));
				var Z = gX;
				((X = s5), (G = VU));
				var Y = Z.actualDuration !== 0 || (Z.subtreeFlags & 10256) !== 0 || (Z.flags & 10256) !== 0;
				Y ? (J2 = j9) : ((J2 = SB), (gX = gB = null), Lz(B, B.pendingLanes), (N1 = 0), (M4 = null));
				var $ = B.pendingLanes;
				if (
					($ === 0 && (vB = null),
					Y || xz(B),
					($ = U(X)),
					(Z = Z.stateNode),
					D2 && typeof D2.onCommitFiberRoot === 'function')
				)
					try {
						var R = (Z.current.flags & 128) === 128;
						switch ($) {
							case Q5:
								var z = ZZ;
								break;
							case y5:
								z = YZ;
								break;
							case K6:
								z = $X;
								break;
							case f7:
								z = $Z;
								break;
							default:
								z = $X;
						}
						D2.onCommitFiberRoot(RX, Z, z, R);
					} catch (K) {
						W6 || ((W6 = !0), console.error('React instrumentation encountered an error: %o', K));
					}
				if ((w6 && B.memoizedUpdaters.clear(), WM(), G !== null)) {
					((R = A.T), (z = L0.p), (L0.p = Q5), (A.T = null));
					try {
						var H = B.onRecoverableError;
						for (Z = 0; Z < G.length; Z++) {
							var J = G[Z],
								w = LM(J.stack);
							k(J.source, H, J.value, w);
						}
					} finally {
						((A.T = R), (L0.p = z));
					}
				}
				((s5 & 3) !== 0 && K3(),
					J6(B),
					($ = B.pendingLanes),
					(X & 261930) !== 0 && ($ & 42) !== 0
						? ((Z9 = !0), B === YY ? Q4++ : ((Q4 = 0), (YY = B)))
						: (Q4 = 0),
					Y || H1(X, f6),
					_3(0, !1));
			}
		}
		function LM(B) {
			return (
				(B = { componentStack: B }),
				Object.defineProperty(B, 'digest', {
					get: function () {
						console.error(
							'You are accessing "digest" from the errorInfo object passed to onRecoverableError. This property is no longer provided as part of errorInfo but can be accessed as a property of the Error instance itself.',
						);
					},
				}),
				B
			);
		}
		function Lz(B, X) {
			(B.pooledCacheLanes &= X) === 0 &&
				((X = B.pooledCache), X != null && ((B.pooledCache = null), B3(X)));
		}
		function K3() {
			return (Kz(), Oz(), _z(), Az());
		}
		function Az() {
			if (J2 !== j9) return !1;
			var B = gB,
				X = XY;
			XY = 0;
			var G = U(s5),
				Z = K6 === 0 || K6 > G ? K6 : G;
			G = A.T;
			var Y = L0.p;
			try {
				((L0.p = Z), (A.T = null));
				var $ = ZY;
				((ZY = null), (Z = gB));
				var R = s5;
				if (((J2 = SB), (gX = gB = null), (s5 = 0), (M0 & (q2 | w5)) !== L2))
					throw Error('Cannot flush passive effects while already rendering.');
				(G5(R), ($Y = !0), (F9 = !1));
				var z = 0;
				if (((u6 = null), (z = K2()), l5 === PU)) rX(f6, z, d6);
				else {
					var H = f6,
						J = z,
						w = l5 === BY;
					!y0 ||
						J <= H ||
						(r0
							? r0.run(
									console.timeStamp.bind(
										console,
										w ? 'Waiting for Paint' : 'Waiting',
										H,
										J,
										R0,
										$0,
										'secondary-light',
									),
								)
							: console.timeStamp(
									w ? 'Waiting for Paint' : 'Waiting',
									H,
									J,
									R0,
									$0,
									'secondary-light',
								));
				}
				((H = M0), (M0 |= w5));
				var K = Z.current;
				(l4(), Xz(K));
				var M = Z.current;
				((K = GY), l4(), tR(Z, M, R, $, K), xz(Z), (M0 = H));
				var _ = K2();
				if (
					((M = z),
					(K = r0),
					u6 !== null
						? H$(M, _, u6, !0, K)
						: !y0 ||
							_ <= M ||
							(K
								? K.run(
										console.timeStamp.bind(
											console,
											'Remaining Effects',
											M,
											_,
											R0,
											$0,
											'secondary-dark',
										),
									)
								: console.timeStamp('Remaining Effects', M, _, R0, $0, 'secondary-dark')),
					H1(R, _),
					_3(0, !1),
					F9 ? (Z === M4 ? N1++ : ((N1 = 0), (M4 = Z))) : (N1 = 0),
					(F9 = $Y = !1),
					D2 && typeof D2.onPostCommitFiberRoot === 'function')
				)
					try {
						D2.onPostCommitFiberRoot(RX, Z);
					} catch (S) {
						W6 || ((W6 = !0), console.error('React instrumentation encountered an error: %o', S));
					}
				var V = Z.current.stateNode;
				return ((V.effectDuration = 0), (V.passiveEffectDuration = 0), !0);
			} finally {
				((L0.p = Y), (A.T = G), Lz(B, X));
			}
		}
		function jz(B, X, G) {
			((X = Z5(G, X)),
				P$(X),
				(X = tG(B.stateNode, X, 2)),
				(B = RB(B, X, 2)),
				B !== null && (r6(B, 2), J6(B)));
		}
		function _0(B, X, G) {
			if (((kX = !1), B.tag === 3)) jz(B, B, G);
			else {
				for (; X !== null;) {
					if (X.tag === 3) {
						jz(X, B, G);
						return;
					}
					if (X.tag === 1) {
						var Z = X.stateNode;
						if (
							typeof X.type.getDerivedStateFromError === 'function' ||
							(typeof Z.componentDidCatch === 'function' && (vB === null || !vB.has(Z)))
						) {
							((B = Z5(G, B)),
								P$(B),
								(G = rG(2)),
								(Z = RB(X, G, 2)),
								Z !== null && (eG(G, Z, X, B), r6(Z, 2), J6(Z)));
							return;
						}
					}
					X = X.return;
				}
				console.error(
					`Internal React error: Attempted to capture a commit phase error inside a detached tree. This indicates a bug in React. Potential causes include deleting the same fiber more than once, committing an already-finished tree, or an inconsistent return pointer.

Error message:

%s`,
					G,
				);
			}
		}
		function A8(B, X, G) {
			var Z = B.pingCache;
			if (Z === null) {
				Z = B.pingCache = new bW();
				var Y = new Set();
				Z.set(X, Y);
			} else ((Y = Z.get(X)), Y === void 0 && ((Y = new Set()), Z.set(X, Y)));
			Y.has(G) || ((tZ = !0), Y.add(G), (Z = AM.bind(null, B, X, G)), w6 && O3(B, G), X.then(Z, Z));
		}
		function AM(B, X, G) {
			var Z = B.pingCache;
			(Z !== null && Z.delete(X),
				(B.pingedLanes |= B.suspendedLanes & G),
				(B.warmLanes &= ~G),
				(G & 127) !== 0
					? 0 > L6 && ((PB = L6 = Y2()), (h3 = t7('Promise Resolved')), (xB = r7))
					: (G & 4194048) !== 0 &&
						0 > V5 &&
						((A6 = V5 = Y2()), (s3 = t7('Promise Resolved')), (vZ = r7)),
				Yz() &&
					A.actQueue === null &&
					console.error(`A suspended resource finished loading inside a test, but the event was not wrapped in act(...).

When testing, code that resolves suspended data should be wrapped into act(...):

act(() => {
  /* finish loading suspended data */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act`),
				S0 === B &&
					(X0 & G) === G &&
					(a0 === VB || (a0 === q9 && (X0 & 62914560) === X0 && K2() - _9 < jU)
						? (M0 & q2) === L2 && r1(B, 0)
						: (rZ |= G),
					x1 === X0 && (x1 = 0)),
				J6(B));
		}
		function Fz(B, X) {
			(X === 0 && (X = m1()), (B = C2(B, X)), B !== null && (r6(B, X), J6(B)));
		}
		function jM(B) {
			var X = B.memoizedState,
				G = 0;
			(X !== null && (G = X.retryLane), Fz(B, G));
		}
		function FM(B, X) {
			var G = 0;
			switch (B.tag) {
				case 31:
				case 13:
					var { stateNode: Z, memoizedState: Y } = B;
					Y !== null && (G = Y.retryLane);
					break;
				case 19:
					Z = B.stateNode;
					break;
				case 22:
					Z = B.stateNode._retryCache;
					break;
				default:
					throw Error('Pinged unknown suspense boundary type. This is probably a bug in React.');
			}
			(Z !== null && Z.delete(X), Fz(B, G));
		}
		function j8(B, X, G) {
			if ((X.subtreeFlags & 67117056) !== 0)
				for (X = X.child; X !== null;) {
					var Z = B,
						Y = X,
						$ = Y.type === S7;
					(($ = G || $),
						Y.tag !== 22
							? Y.flags & 67108864
								? $ && k(Y, Pz, Z, Y)
								: j8(Z, Y, $)
							: Y.memoizedState === null &&
								($ && Y.flags & 8192
									? k(Y, Pz, Z, Y)
									: Y.subtreeFlags & 67108864 && k(Y, j8, Z, Y, $)),
						(X = X.sibling));
				}
		}
		function Pz(B, X) {
			g0(!0);
			try {
				(nR(X), Gz(X), iR(B, X.alternate, X, !1), rR(B, X, 0, null, !1, 0));
			} finally {
				g0(!1);
			}
		}
		function xz(B) {
			var X = !0;
			(B.current.mode & (T2 | f5) || (X = !1), j8(B, B.current, X));
		}
		function Nz(B) {
			if ((M0 & q2) === L2) {
				var X = B.tag;
				if (X === 3 || X === 1 || X === 0 || X === 11 || X === 14 || X === 15) {
					if (((X = v(B) || 'ReactComponent'), P9 !== null)) {
						if (P9.has(X)) return;
						P9.add(X);
					} else P9 = new Set([X]);
					k(B, function () {
						console.error(
							"Can't perform a React state update on a component that hasn't mounted yet. This indicates that you have a side-effect in your render function that asynchronously tries to update the component. Move this work to useEffect instead.",
						);
					});
				}
			}
		}
		function O3(B, X) {
			w6 &&
				B.memoizedUpdaters.forEach(function (G) {
					sX(B, G, X);
				});
		}
		function PM(B, X) {
			var G = A.actQueue;
			return G !== null ? (G.push(X), fW) : GZ(B, X);
		}
		function xM(B) {
			Yz() &&
				A.actQueue === null &&
				k(B, function () {
					console.error(
						`An update to %s inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act`,
						v(B),
					);
				});
		}
		function J6(B) {
			(B !== bX && B.next === null && (bX === null ? (x9 = bX = B) : (bX = bX.next = B)),
				(N9 = !0),
				A.actQueue !== null ? zY || ((zY = !0), Cz()) : RY || ((RY = !0), Cz()));
		}
		function _3(B, X) {
			if (!HY && N9) {
				HY = !0;
				do {
					var G = !1;
					for (var Z = x9; Z !== null;) {
						if (!X)
							if (B !== 0) {
								var Y = Z.pendingLanes;
								if (Y === 0) var $ = 0;
								else {
									var { suspendedLanes: R, pingedLanes: z } = Z;
									(($ = (1 << (31 - g2(42 | B) + 1)) - 1),
										($ &= Y & ~(R & ~z)),
										($ = $ & 201326741 ? ($ & 201326741) | 1 : $ ? $ | 2 : 0));
								}
								$ !== 0 && ((G = !0), Vz(Z, $));
							} else
								(($ = X0),
									($ = dB(
										Z,
										Z === S0 ? $ : 0,
										Z.cancelPendingCommit !== null || Z.timeoutHandle !== C1,
									)),
									($ & 3) === 0 || sB(Z, $) || ((G = !0), Vz(Z, $)));
						Z = Z.next;
					}
				} while (G);
				HY = !1;
			}
		}
		function NM() {
			((K4 = window.event), F8());
		}
		function F8() {
			N9 = zY = RY = !1;
			var B = 0;
			kB !== 0 && vM() && (B = kB);
			for (var X = K2(), G = null, Z = x9; Z !== null;) {
				var Y = Z.next,
					$ = Ez(Z, X);
				if ($ === 0)
					((Z.next = null), G === null ? (x9 = Y) : (G.next = Y), Y === null && (bX = G));
				else if (((G = Z), B !== 0 || ($ & 3) !== 0)) N9 = !0;
				Z = Y;
			}
			((J2 !== SB && J2 !== j9) || _3(B, !1), kB !== 0 && (kB = 0));
		}
		function Ez(B, X) {
			for (
				var { suspendedLanes: G, pingedLanes: Z, expirationTimes: Y } = B,
					$ = B.pendingLanes & -62914561;
				0 < $;
			) {
				var R = 31 - g2($),
					z = 1 << R,
					H = Y[R];
				if (H === -1) {
					if ((z & G) === 0 || (z & Z) !== 0) Y[R] = u9(z, X);
				} else H <= X && (B.expiredLanes |= z);
				$ &= ~z;
			}
			if (
				((X = S0),
				(G = X0),
				(G = dB(B, B === X ? G : 0, B.cancelPendingCommit !== null || B.timeoutHandle !== C1)),
				(Z = B.callbackNode),
				G === 0 || (B === X && (N0 === F1 || N0 === P1)) || B.cancelPendingCommit !== null)
			)
				return (Z !== null && P8(Z), (B.callbackNode = null), (B.callbackPriority = 0));
			if ((G & 3) === 0 || sB(B, G)) {
				if (((X = G & -G), X !== B.callbackPriority || (A.actQueue !== null && Z !== JY))) P8(Z);
				else return X;
				switch (U(G)) {
					case Q5:
					case y5:
						G = YZ;
						break;
					case K6:
						G = $X;
						break;
					case f7:
						G = $Z;
						break;
					default:
						G = $X;
				}
				return (
					(Z = Iz.bind(null, B)),
					A.actQueue !== null ? (A.actQueue.push(Z), (G = JY)) : (G = GZ(G, Z)),
					(B.callbackPriority = X),
					(B.callbackNode = G),
					X
				);
			}
			return (Z !== null && P8(Z), (B.callbackPriority = 2), (B.callbackNode = null), 2);
		}
		function Iz(B, X) {
			if (((Z9 = G9 = !1), (K4 = window.event), J2 !== SB && J2 !== j9))
				return ((B.callbackNode = null), (B.callbackPriority = 0), null);
			var G = B.callbackNode;
			if ((l5 === A9 && (l5 = BY), K3() && B.callbackNode !== G)) return null;
			var Z = X0;
			if (
				((Z = dB(B, B === S0 ? Z : 0, B.cancelPendingCommit !== null || B.timeoutHandle !== C1)),
				Z === 0)
			)
				return null;
			return (
				Rz(B, Z, X),
				Ez(B, K2()),
				B.callbackNode != null && B.callbackNode === G ? Iz.bind(null, B) : null
			);
		}
		function Vz(B, X) {
			if (K3()) return null;
			((G9 = Z9), (Z9 = !1), Rz(B, X, !0));
		}
		function P8(B) {
			B !== JY && B !== null && Wq(B);
		}
		function Cz() {
			(A.actQueue !== null &&
				A.actQueue.push(function () {
					return (F8(), null);
				}),
				nW(function () {
					(M0 & (q2 | w5)) !== L2 ? GZ(ZZ, NM) : F8();
				}));
		}
		function x8() {
			if (kB === 0) {
				var B = w1;
				(B === 0 && ((B = b7), (b7 <<= 1), (b7 & 261888) === 0 && (b7 = 256)), (kB = B));
			}
			return kB;
		}
		function Dz(B) {
			if (B == null || typeof B === 'symbol' || typeof B === 'boolean') return null;
			if (typeof B === 'function') return B;
			return (V0(B, 'action'), nX('' + B));
		}
		function Tz(B, X) {
			var G = X.ownerDocument.createElement('input');
			return (
				(G.name = X.name),
				(G.value = X.value),
				B.id && G.setAttribute('form', B.id),
				X.parentNode.insertBefore(G, X),
				(B = new FormData(B)),
				G.parentNode.removeChild(G),
				B
			);
		}
		function EM(B, X, G, Z, Y) {
			if (X === 'submit' && G && G.stateNode === Y) {
				var $ = Dz((Y[k2] || null).action),
					R = Z.submitter;
				R &&
					((X = (X = R[k2] || null) ? Dz(X.formAction) : R.getAttribute('formAction')),
					X !== null && (($ = X), (R = null)));
				var z = new l7('action', 'action', null, Z, Y);
				B.push({
					event: z,
					listeners: [
						{
							instance: null,
							listener: function () {
								if (Z.defaultPrevented) {
									if (kB !== 0) {
										var H = R ? Tz(Y, R) : new FormData(Y),
											J = { pending: !0, data: H, method: Y.method, action: $ };
										(Object.freeze(J), lG(G, J, null, H));
									}
								} else
									typeof $ === 'function' &&
										(z.preventDefault(),
										(H = R ? Tz(Y, R) : new FormData(Y)),
										(J = { pending: !0, data: H, method: Y.method, action: $ }),
										Object.freeze(J),
										lG(G, J, $, H));
							},
							currentTarget: Y,
						},
					],
				});
			}
		}
		function F7(B, X, G) {
			B.currentTarget = G;
			try {
				X(B);
			} catch (Z) {
				jZ(Z);
			}
			B.currentTarget = null;
		}
		function vz(B, X) {
			X = (X & 4) !== 0;
			for (var G = 0; G < B.length; G++) {
				var Z = B[G];
				B: {
					var Y = void 0,
						$ = Z.event;
					if (((Z = Z.listeners), X))
						for (var R = Z.length - 1; 0 <= R; R--) {
							var z = Z[R],
								H = z.instance,
								J = z.currentTarget;
							if (((z = z.listener), H !== Y && $.isPropagationStopped())) break B;
							(H !== null ? k(H, F7, $, z, J) : F7($, z, J), (Y = H));
						}
					else
						for (R = 0; R < Z.length; R++) {
							if (
								((z = Z[R]),
								(H = z.instance),
								(J = z.currentTarget),
								(z = z.listener),
								H !== Y && $.isPropagationStopped())
							)
								break B;
							(H !== null ? k(H, F7, $, z, J) : F7($, z, J), (Y = H));
						}
				}
			}
		}
		function U0(B, X) {
			UY.has(B) ||
				console.error(
					'Did not expect a listenToNonDelegatedEvent() call for "%s". This is a bug in React. Please file an issue.',
					B,
				);
			var G = X[RZ];
			G === void 0 && (G = X[RZ] = new Set());
			var Z = B + '__bubble';
			G.has(Z) || (Sz(X, B, 2, !1), G.add(Z));
		}
		function N8(B, X, G) {
			UY.has(B) &&
				!X &&
				console.error(
					'Did not expect a listenToNativeEvent() call for "%s" in the bubble phase. This is a bug in React. Please file an issue.',
					B,
				);
			var Z = 0;
			(X && (Z |= 4), Sz(G, B, Z, X));
		}
		function E8(B) {
			if (!B[E9]) {
				((B[E9] = !0),
					CH.forEach(function (G) {
						G !== 'selectionchange' && (UY.has(G) || N8(G, !1, B), N8(G, !0, B));
					}));
				var X = B.nodeType === 9 ? B : B.ownerDocument;
				X === null || X[E9] || ((X[E9] = !0), N8('selectionchange', !1, X));
			}
		}
		function Sz(B, X, G, Z) {
			switch (MH(X)) {
				case Q5:
					var Y = Rq;
					break;
				case y5:
					Y = zq;
					break;
				default:
					Y = d8;
			}
			((G = Y.bind(null, X, G, B)),
				(Y = void 0),
				!QZ || (X !== 'touchstart' && X !== 'touchmove' && X !== 'wheel') || (Y = !0),
				Z
					? Y !== void 0
						? B.addEventListener(X, G, { capture: !0, passive: Y })
						: B.addEventListener(X, G, !0)
					: Y !== void 0
						? B.addEventListener(X, G, { passive: Y })
						: B.addEventListener(X, G, !1));
		}
		function I8(B, X, G, Z, Y) {
			var $ = Z;
			if ((X & 1) === 0 && (X & 2) === 0 && Z !== null)
				B: for (;;) {
					if (Z === null) return;
					var R = Z.tag;
					if (R === 3 || R === 4) {
						var z = Z.stateNode.containerInfo;
						if (z === Y) break;
						if (R === 4)
							for (R = Z.return; R !== null;) {
								var H = R.tag;
								if ((H === 3 || H === 4) && R.stateNode.containerInfo === Y) return;
								R = R.return;
							}
						for (; z !== null;) {
							if (((R = b(z)), R === null)) return;
							if (((H = R.tag), H === 5 || H === 6 || H === 26 || H === 27)) {
								Z = $ = R;
								continue B;
							}
							z = z.parentNode;
						}
					}
					Z = Z.return;
				}
			lY(function () {
				var J = $,
					w = n9(G),
					K = [];
				B: {
					var M = MJ.get(B);
					if (M !== void 0) {
						var _ = l7,
							V = B;
						switch (B) {
							case 'keypress':
								if (D4(G) === 0) break B;
							case 'keydown':
							case 'keyup':
								_ = XW;
								break;
							case 'focusin':
								((V = 'focus'), (_ = wZ));
								break;
							case 'focusout':
								((V = 'blur'), (_ = wZ));
								break;
							case 'beforeblur':
							case 'afterblur':
								_ = wZ;
								break;
							case 'click':
								if (G.button === 2) break B;
							case 'auxclick':
							case 'dblclick':
							case 'mousedown':
							case 'mousemove':
							case 'mouseup':
							case 'mouseout':
							case 'mouseover':
							case 'contextmenu':
								_ = rH;
								break;
							case 'drag':
							case 'dragend':
							case 'dragenter':
							case 'dragexit':
							case 'dragleave':
							case 'dragover':
							case 'dragstart':
							case 'drop':
								_ = sq;
								break;
							case 'touchcancel':
							case 'touchend':
							case 'touchmove':
							case 'touchstart':
								_ = YW;
								break;
							case HJ:
							case JJ:
							case UJ:
								_ = cq;
								break;
							case QJ:
								_ = RW;
								break;
							case 'scroll':
							case 'scrollend':
								_ = hq;
								break;
							case 'wheel':
								_ = HW;
								break;
							case 'copy':
							case 'cut':
							case 'paste':
								_ = oq;
								break;
							case 'gotpointercapture':
							case 'lostpointercapture':
							case 'pointercancel':
							case 'pointerdown':
							case 'pointermove':
							case 'pointerout':
							case 'pointerover':
							case 'pointerup':
								_ = BJ;
								break;
							case 'toggle':
							case 'beforetoggle':
								_ = UW;
						}
						var S = (X & 4) !== 0,
							b0 = !S && (B === 'scroll' || B === 'scrollend'),
							Q0 = S ? (M !== null ? M + 'Capture' : null) : M;
						S = [];
						for (var Q = J, q; Q !== null;) {
							var W = Q;
							if (
								((q = W.stateNode),
								(W = W.tag),
								(W !== 5 && W !== 26 && W !== 27) ||
									q === null ||
									Q0 === null ||
									((W = iX(Q, Q0)), W != null && S.push(L3(Q, W, q))),
								b0)
							)
								break;
							Q = Q.return;
						}
						0 < S.length && ((M = new _(M, V, null, G, w)), K.push({ event: M, listeners: S }));
					}
				}
				if ((X & 7) === 0) {
					B: {
						if (
							((M = B === 'mouseover' || B === 'pointerover'),
							(_ = B === 'mouseout' || B === 'pointerout'),
							M && G !== D3 && (V = G.relatedTarget || G.fromElement) && (b(V) || V[KB]))
						)
							break B;
						if (_ || M) {
							if (
								((M =
									w.window === w
										? w
										: (M = w.ownerDocument)
											? M.defaultView || M.parentWindow
											: window),
								_)
							) {
								if (
									((V = G.relatedTarget || G.toElement),
									(_ = J),
									(V = V ? b(V) : null),
									V !== null &&
										((b0 = t2(V)), (S = V.tag), V !== b0 || (S !== 5 && S !== 27 && S !== 6)))
								)
									V = null;
							} else ((_ = null), (V = J));
							if (_ !== V) {
								if (
									((S = rH),
									(W = 'onMouseLeave'),
									(Q0 = 'onMouseEnter'),
									(Q = 'mouse'),
									B === 'pointerout' || B === 'pointerover')
								)
									((S = BJ), (W = 'onPointerLeave'), (Q0 = 'onPointerEnter'), (Q = 'pointer'));
								if (
									((b0 = _ == null ? M : i(_)),
									(q = V == null ? M : i(V)),
									(M = new S(W, Q + 'leave', _, G, w)),
									(M.target = b0),
									(M.relatedTarget = q),
									(W = null),
									b(w) === J &&
										((S = new S(Q0, Q + 'enter', V, G, w)),
										(S.target = q),
										(S.relatedTarget = b0),
										(W = S)),
									(b0 = W),
									_ && V)
								)
									X: {
										((S = IM), (Q0 = _), (Q = V), (q = 0));
										for (W = Q0; W; W = S(W)) q++;
										W = 0;
										for (var F = Q; F; F = S(F)) W++;
										for (; 0 < q - W;) ((Q0 = S(Q0)), q--);
										for (; 0 < W - q;) ((Q = S(Q)), W--);
										for (; q--;) {
											if (Q0 === Q || (Q !== null && Q0 === Q.alternate)) {
												S = Q0;
												break X;
											}
											((Q0 = S(Q0)), (Q = S(Q)));
										}
										S = null;
									}
								else S = null;
								(_ !== null && gz(K, M, _, S, !1),
									V !== null && b0 !== null && gz(K, b0, V, S, !0));
							}
						}
					}
					B: {
						if (
							((M = J ? i(J) : window),
							(_ = M.nodeName && M.nodeName.toLowerCase()),
							_ === 'select' || (_ === 'input' && M.type === 'file'))
						)
							var D = tY;
						else if (nY(M))
							if (RJ) D = fQ;
							else {
								D = mQ;
								var a = bQ;
							}
						else
							((_ = M.nodeName),
								!_ || _.toLowerCase() !== 'input' || (M.type !== 'checkbox' && M.type !== 'radio')
									? J && oX(J.elementType) && (D = tY)
									: (D = yQ));
						if (D && (D = D(B, J))) {
							iY(K, D, G, w);
							break B;
						}
						(a && a(B, M, J),
							B === 'focusout' &&
								J &&
								M.type === 'number' &&
								J.memoizedProps.value != null &&
								s9(M, 'number', M.value));
					}
					switch (((a = J ? i(J) : window), B)) {
						case 'focusin':
							if (nY(a) || a.contentEditable === 'true') ((qX = a), (OZ = J), (m3 = null));
							break;
						case 'focusout':
							m3 = OZ = qX = null;
							break;
						case 'mousedown':
							_Z = !0;
							break;
						case 'contextmenu':
						case 'mouseup':
						case 'dragend':
							((_Z = !1), Y$(K, G, w));
							break;
						case 'selectionchange':
							if (WW) break;
						case 'keydown':
						case 'keyup':
							Y$(K, G, w);
					}
					var y;
					if (KZ)
						B: {
							switch (B) {
								case 'compositionstart':
									var m = 'onCompositionStart';
									break B;
								case 'compositionend':
									m = 'onCompositionEnd';
									break B;
								case 'compositionupdate':
									m = 'onCompositionUpdate';
									break B;
							}
							m = void 0;
						}
					else
						MX
							? aY(B, G) && (m = 'onCompositionEnd')
							: B === 'keydown' && G.keyCode === XJ && (m = 'onCompositionStart');
					if (
						(m &&
							(GJ &&
								G.locale !== 'ko' &&
								(MX || m !== 'onCompositionStart'
									? m === 'onCompositionEnd' && MX && (y = pY())
									: ((OB = w), (MZ = 'value' in OB ? OB.value : OB.textContent), (MX = !0))),
							(a = P7(J, m)),
							0 < a.length &&
								((m = new eH(m, B, null, G, w)),
								K.push({ event: m, listeners: a }),
								y ? (m.data = y) : ((y = oY(G)), y !== null && (m.data = y)))),
						(y = MW ? vQ(B, G) : SQ(B, G)))
					)
						((m = P7(J, 'onBeforeInput')),
							0 < m.length &&
								((a = new iq('onBeforeInput', 'beforeinput', null, G, w)),
								K.push({ event: a, listeners: m }),
								(a.data = y)));
					EM(K, B, J, G, w);
				}
				vz(K, X);
			});
		}
		function L3(B, X, G) {
			return { instance: B, listener: X, currentTarget: G };
		}
		function P7(B, X) {
			for (var G = X + 'Capture', Z = []; B !== null;) {
				var Y = B,
					$ = Y.stateNode;
				if (
					((Y = Y.tag),
					(Y !== 5 && Y !== 26 && Y !== 27) ||
						$ === null ||
						((Y = iX(B, G)),
						Y != null && Z.unshift(L3(B, Y, $)),
						(Y = iX(B, X)),
						Y != null && Z.push(L3(B, Y, $))),
					B.tag === 3)
				)
					return Z;
				B = B.return;
			}
			return [];
		}
		function IM(B) {
			if (B === null) return null;
			do B = B.return;
			while (B && B.tag !== 5 && B.tag !== 27);
			return B ? B : null;
		}
		function gz(B, X, G, Z, Y) {
			for (var $ = X._reactName, R = []; G !== null && G !== Z;) {
				var z = G,
					H = z.alternate,
					J = z.stateNode;
				if (((z = z.tag), H !== null && H === Z)) break;
				((z !== 5 && z !== 26 && z !== 27) ||
					J === null ||
					((H = J),
					Y
						? ((J = iX(G, $)), J != null && R.unshift(L3(G, J, H)))
						: Y || ((J = iX(G, $)), J != null && R.push(L3(G, J, H)))),
					(G = G.return));
			}
			R.length !== 0 && B.push({ event: X, listeners: R });
		}
		function V8(B, X) {
			(VQ(B, X),
				(B !== 'input' && B !== 'textarea' && B !== 'select') ||
					X == null ||
					X.value !== null ||
					iH ||
					((iH = !0),
					B === 'select' && X.multiple
						? console.error(
								'`value` prop on `%s` should not be null. Consider using an empty array when `multiple` is set to `true` to clear the component or `undefined` for uncontrolled components.',
								B,
							)
						: console.error(
								'`value` prop on `%s` should not be null. Consider using an empty string to clear the component or `undefined` for uncontrolled components.',
								B,
							)));
			var G = { registrationNameDependencies: J1, possibleRegistrationNames: zZ };
			(oX(B) || typeof X.is === 'string' || DQ(B, X, G),
				X.contentEditable &&
					!X.suppressContentEditableWarning &&
					X.children != null &&
					console.error(
						'A component is `contentEditable` and contains `children` managed by React. It is now your responsibility to guarantee that none of those nodes are unexpectedly modified or duplicated. This is probably not intentional.',
					));
		}
		function w2(B, X, G, Z) {
			X !== G && ((G = QB(G)), QB(X) !== G && (Z[B] = X));
		}
		function VM(B, X, G) {
			X.forEach(function (Z) {
				G[mz(Z)] = Z === 'style' ? D8(B) : B.getAttribute(Z);
			});
		}
		function U6(B, X) {
			X === !1
				? console.error(
						'Expected `%s` listener to be a function, instead got `false`.\n\nIf you used to conditionally omit it with %s={condition && value}, pass %s={condition ? value : undefined} instead.',
						B,
						B,
						B,
					)
				: console.error(
						'Expected `%s` listener to be a function, instead got a value of `%s` type.',
						B,
						typeof X,
					);
		}
		function kz(B, X) {
			return (
				(B =
					B.namespaceURI === h7 || B.namespaceURI === HX
						? B.ownerDocument.createElementNS(B.namespaceURI, B.tagName)
						: B.ownerDocument.createElement(B.tagName)),
				(B.innerHTML = X),
				B.innerHTML
			);
		}
		function QB(B) {
			return (
				t6(B) &&
					(console.error(
						'The provided HTML markup uses a value of unsupported type %s. This value must be coerced to a string before using it here.',
						hB(B),
					),
					W2(B)),
				(typeof B === 'string' ? B : '' + B)
					.replace(
						uW,
						`
`,
					)
					.replace(hW, '')
			);
		}
		function bz(B, X) {
			return ((X = QB(X)), QB(B) === X ? !0 : !1);
		}
		function T0(B, X, G, Z, Y, $) {
			switch (G) {
				case 'children':
					if (typeof Z === 'string')
						(C4(Z, X, !1), X === 'body' || (X === 'textarea' && Z === '') || aX(B, Z));
					else if (typeof Z === 'number' || typeof Z === 'bigint')
						(C4('' + Z, X, !1), X !== 'body' && aX(B, '' + Z));
					break;
				case 'className':
					E4(B, 'class', Z);
					break;
				case 'tabIndex':
					E4(B, 'tabindex', Z);
					break;
				case 'dir':
				case 'role':
				case 'viewBox':
				case 'width':
				case 'height':
					E4(B, G, Z);
					break;
				case 'style':
					hY(B, Z, $);
					break;
				case 'data':
					if (X !== 'object') {
						E4(B, 'data', Z);
						break;
					}
				case 'src':
				case 'href':
					if (Z === '' && (X !== 'a' || G !== 'href')) {
						(G === 'src'
							? console.error(
									'An empty string ("") was passed to the %s attribute. This may cause the browser to download the whole page again over the network. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
									G,
									G,
								)
							: console.error(
									'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
									G,
									G,
								),
							B.removeAttribute(G));
						break;
					}
					if (
						Z == null ||
						typeof Z === 'function' ||
						typeof Z === 'symbol' ||
						typeof Z === 'boolean'
					) {
						B.removeAttribute(G);
						break;
					}
					(V0(Z, G), (Z = nX('' + Z)), B.setAttribute(G, Z));
					break;
				case 'action':
				case 'formAction':
					if (
						(Z != null &&
							(X === 'form'
								? G === 'formAction'
									? console.error(
											'You can only pass the formAction prop to <input> or <button>. Use the action prop on <form>.',
										)
									: typeof Z === 'function' &&
										((Y.encType == null && Y.method == null) ||
											C9 ||
											((C9 = !0),
											console.error(
												'Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden.',
											)),
										Y.target == null ||
											V9 ||
											((V9 = !0),
											console.error(
												'Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window.',
											)))
								: X === 'input' || X === 'button'
									? G === 'action'
										? console.error(
												'You can only pass the action prop to <form>. Use the formAction prop on <input> or <button>.',
											)
										: X !== 'input' || Y.type === 'submit' || Y.type === 'image' || I9
											? X !== 'button' || Y.type == null || Y.type === 'submit' || I9
												? typeof Z === 'function' &&
													(Y.name == null ||
														kU ||
														((kU = !0),
														console.error(
															'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.',
														)),
													(Y.formEncType == null && Y.formMethod == null) ||
														C9 ||
														((C9 = !0),
														console.error(
															'Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden.',
														)),
													Y.formTarget == null ||
														V9 ||
														((V9 = !0),
														console.error(
															'Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window.',
														)))
												: ((I9 = !0),
													console.error(
														'A button can only specify a formAction along with type="submit" or no type.',
													))
											: ((I9 = !0),
												console.error(
													'An input can only specify a formAction along with type="submit" or type="image".',
												))
									: G === 'action'
										? console.error('You can only pass the action prop to <form>.')
										: console.error(
												'You can only pass the formAction prop to <input> or <button>.',
											)),
						typeof Z === 'function')
					) {
						B.setAttribute(
							G,
							"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')",
						);
						break;
					} else
						typeof $ === 'function' &&
							(G === 'formAction'
								? (X !== 'input' && T0(B, X, 'name', Y.name, Y, null),
									T0(B, X, 'formEncType', Y.formEncType, Y, null),
									T0(B, X, 'formMethod', Y.formMethod, Y, null),
									T0(B, X, 'formTarget', Y.formTarget, Y, null))
								: (T0(B, X, 'encType', Y.encType, Y, null),
									T0(B, X, 'method', Y.method, Y, null),
									T0(B, X, 'target', Y.target, Y, null)));
					if (Z == null || typeof Z === 'symbol' || typeof Z === 'boolean') {
						B.removeAttribute(G);
						break;
					}
					(V0(Z, G), (Z = nX('' + Z)), B.setAttribute(G, Z));
					break;
				case 'onClick':
					Z != null && (typeof Z !== 'function' && U6(G, Z), (B.onclick = E6));
					break;
				case 'onScroll':
					Z != null && (typeof Z !== 'function' && U6(G, Z), U0('scroll', B));
					break;
				case 'onScrollEnd':
					Z != null && (typeof Z !== 'function' && U6(G, Z), U0('scrollend', B));
					break;
				case 'dangerouslySetInnerHTML':
					if (Z != null) {
						if (typeof Z !== 'object' || !('__html' in Z))
							throw Error(
								'`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information.',
							);
						if (((G = Z.__html), G != null)) {
							if (Y.children != null)
								throw Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.');
							B.innerHTML = G;
						}
					}
					break;
				case 'multiple':
					B.multiple = Z && typeof Z !== 'function' && typeof Z !== 'symbol';
					break;
				case 'muted':
					B.muted = Z && typeof Z !== 'function' && typeof Z !== 'symbol';
					break;
				case 'suppressContentEditableWarning':
				case 'suppressHydrationWarning':
				case 'defaultValue':
				case 'defaultChecked':
				case 'innerHTML':
				case 'ref':
					break;
				case 'autoFocus':
					break;
				case 'xlinkHref':
					if (
						Z == null ||
						typeof Z === 'function' ||
						typeof Z === 'boolean' ||
						typeof Z === 'symbol'
					) {
						B.removeAttribute('xlink:href');
						break;
					}
					(V0(Z, G), (G = nX('' + Z)), B.setAttributeNS(E1, 'xlink:href', G));
					break;
				case 'contentEditable':
				case 'spellCheck':
				case 'draggable':
				case 'value':
				case 'autoReverse':
				case 'externalResourcesRequired':
				case 'focusable':
				case 'preserveAlpha':
					Z != null && typeof Z !== 'function' && typeof Z !== 'symbol'
						? (V0(Z, G), B.setAttribute(G, '' + Z))
						: B.removeAttribute(G);
					break;
				case 'inert':
					Z !== '' ||
						D9[G] ||
						((D9[G] = !0),
						console.error(
							'Received an empty string for a boolean attribute `%s`. This will treat the attribute as if it were false. Either pass `false` to silence this warning, or pass `true` if you used an empty string in earlier versions of React to indicate this attribute is true.',
							G,
						));
				case 'allowFullScreen':
				case 'async':
				case 'autoPlay':
				case 'controls':
				case 'default':
				case 'defer':
				case 'disabled':
				case 'disablePictureInPicture':
				case 'disableRemotePlayback':
				case 'formNoValidate':
				case 'hidden':
				case 'loop':
				case 'noModule':
				case 'noValidate':
				case 'open':
				case 'playsInline':
				case 'readOnly':
				case 'required':
				case 'reversed':
				case 'scoped':
				case 'seamless':
				case 'itemScope':
					Z && typeof Z !== 'function' && typeof Z !== 'symbol'
						? B.setAttribute(G, '')
						: B.removeAttribute(G);
					break;
				case 'capture':
				case 'download':
					Z === !0
						? B.setAttribute(G, '')
						: Z !== !1 && Z != null && typeof Z !== 'function' && typeof Z !== 'symbol'
							? (V0(Z, G), B.setAttribute(G, Z))
							: B.removeAttribute(G);
					break;
				case 'cols':
				case 'rows':
				case 'size':
				case 'span':
					Z != null && typeof Z !== 'function' && typeof Z !== 'symbol' && !isNaN(Z) && 1 <= Z
						? (V0(Z, G), B.setAttribute(G, Z))
						: B.removeAttribute(G);
					break;
				case 'rowSpan':
				case 'start':
					Z == null || typeof Z === 'function' || typeof Z === 'symbol' || isNaN(Z)
						? B.removeAttribute(G)
						: (V0(Z, G), B.setAttribute(G, Z));
					break;
				case 'popover':
					(U0('beforetoggle', B), U0('toggle', B), N4(B, 'popover', Z));
					break;
				case 'xlinkActuate':
					N6(B, E1, 'xlink:actuate', Z);
					break;
				case 'xlinkArcrole':
					N6(B, E1, 'xlink:arcrole', Z);
					break;
				case 'xlinkRole':
					N6(B, E1, 'xlink:role', Z);
					break;
				case 'xlinkShow':
					N6(B, E1, 'xlink:show', Z);
					break;
				case 'xlinkTitle':
					N6(B, E1, 'xlink:title', Z);
					break;
				case 'xlinkType':
					N6(B, E1, 'xlink:type', Z);
					break;
				case 'xmlBase':
					N6(B, QY, 'xml:base', Z);
					break;
				case 'xmlLang':
					N6(B, QY, 'xml:lang', Z);
					break;
				case 'xmlSpace':
					N6(B, QY, 'xml:space', Z);
					break;
				case 'is':
					($ != null && console.error('Cannot update the "is" prop after it has been initialized.'),
						N4(B, 'is', Z));
					break;
				case 'innerText':
				case 'textContent':
					break;
				case 'popoverTarget':
					bU ||
						Z == null ||
						typeof Z !== 'object' ||
						((bU = !0),
						console.error(
							'The `popoverTarget` prop expects the ID of an Element as a string. Received %s instead.',
							Z,
						));
				default:
					!(2 < G.length) || (G[0] !== 'o' && G[0] !== 'O') || (G[1] !== 'n' && G[1] !== 'N')
						? ((G = dY(G)), N4(B, G, Z))
						: J1.hasOwnProperty(G) && Z != null && typeof Z !== 'function' && U6(G, Z);
			}
		}
		function C8(B, X, G, Z, Y, $) {
			switch (G) {
				case 'style':
					hY(B, Z, $);
					break;
				case 'dangerouslySetInnerHTML':
					if (Z != null) {
						if (typeof Z !== 'object' || !('__html' in Z))
							throw Error(
								'`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information.',
							);
						if (((G = Z.__html), G != null)) {
							if (Y.children != null)
								throw Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.');
							B.innerHTML = G;
						}
					}
					break;
				case 'children':
					typeof Z === 'string'
						? aX(B, Z)
						: (typeof Z === 'number' || typeof Z === 'bigint') && aX(B, '' + Z);
					break;
				case 'onScroll':
					Z != null && (typeof Z !== 'function' && U6(G, Z), U0('scroll', B));
					break;
				case 'onScrollEnd':
					Z != null && (typeof Z !== 'function' && U6(G, Z), U0('scrollend', B));
					break;
				case 'onClick':
					Z != null && (typeof Z !== 'function' && U6(G, Z), (B.onclick = E6));
					break;
				case 'suppressContentEditableWarning':
				case 'suppressHydrationWarning':
				case 'innerHTML':
				case 'ref':
					break;
				case 'innerText':
				case 'textContent':
					break;
				default:
					if (J1.hasOwnProperty(G)) Z != null && typeof Z !== 'function' && U6(G, Z);
					else
						B: {
							if (
								G[0] === 'o' &&
								G[1] === 'n' &&
								((Y = G.endsWith('Capture')),
								(X = G.slice(2, Y ? G.length - 7 : void 0)),
								($ = B[k2] || null),
								($ = $ != null ? $[G] : null),
								typeof $ === 'function' && B.removeEventListener(X, $, Y),
								typeof Z === 'function')
							) {
								(typeof $ !== 'function' &&
									$ !== null &&
									(G in B ? (B[G] = null) : B.hasAttribute(G) && B.removeAttribute(G)),
									B.addEventListener(X, Z, Y));
								break B;
							}
							G in B ? (B[G] = Z) : Z === !0 ? B.setAttribute(G, '') : N4(B, G, Z);
						}
			}
		}
		function x2(B, X, G) {
			switch ((V8(X, G), X)) {
				case 'div':
				case 'span':
				case 'svg':
				case 'path':
				case 'a':
				case 'g':
				case 'p':
				case 'li':
					break;
				case 'img':
					(U0('error', B), U0('load', B));
					var Z = !1,
						Y = !1,
						$;
					for ($ in G)
						if (G.hasOwnProperty($)) {
							var R = G[$];
							if (R != null)
								switch ($) {
									case 'src':
										Z = !0;
										break;
									case 'srcSet':
										Y = !0;
										break;
									case 'children':
									case 'dangerouslySetInnerHTML':
										throw Error(
											X +
												' is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.',
										);
									default:
										T0(B, X, $, R, G, null);
								}
						}
					(Y && T0(B, X, 'srcSet', G.srcSet, G, null), Z && T0(B, X, 'src', G.src, G, null));
					return;
				case 'input':
					(BB('input', G), U0('invalid', B));
					var z = ($ = R = Y = null),
						H = null,
						J = null;
					for (Z in G)
						if (G.hasOwnProperty(Z)) {
							var w = G[Z];
							if (w != null)
								switch (Z) {
									case 'name':
										Y = w;
										break;
									case 'type':
										R = w;
										break;
									case 'checked':
										H = w;
										break;
									case 'defaultChecked':
										J = w;
										break;
									case 'value':
										$ = w;
										break;
									case 'defaultValue':
										z = w;
										break;
									case 'children':
									case 'dangerouslySetInnerHTML':
										if (w != null)
											throw Error(
												X +
													' is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.',
											);
										break;
									default:
										T0(B, X, Z, w, G, null);
								}
						}
					(NY(B, G), EY(B, $, z, H, J, R, Y, !1));
					return;
				case 'select':
					(BB('select', G), U0('invalid', B), (Z = R = $ = null));
					for (Y in G)
						if (G.hasOwnProperty(Y) && ((z = G[Y]), z != null))
							switch (Y) {
								case 'value':
									$ = z;
									break;
								case 'defaultValue':
									R = z;
									break;
								case 'multiple':
									Z = z;
								default:
									T0(B, X, Y, z, G, null);
							}
					(CY(B, G),
						(X = $),
						(G = R),
						(B.multiple = !!Z),
						X != null ? f1(B, !!Z, X, !1) : G != null && f1(B, !!Z, G, !0));
					return;
				case 'textarea':
					(BB('textarea', G), U0('invalid', B), ($ = Y = Z = null));
					for (R in G)
						if (G.hasOwnProperty(R) && ((z = G[R]), z != null))
							switch (R) {
								case 'value':
									Z = z;
									break;
								case 'defaultValue':
									Y = z;
									break;
								case 'children':
									$ = z;
									break;
								case 'dangerouslySetInnerHTML':
									if (z != null)
										throw Error('`dangerouslySetInnerHTML` does not make sense on <textarea>.');
									break;
								default:
									T0(B, X, R, z, G, null);
							}
					(DY(B, G), vY(B, Z, Y, $));
					return;
				case 'option':
					IY(B, G);
					for (H in G)
						if (G.hasOwnProperty(H) && ((Z = G[H]), Z != null))
							switch (H) {
								case 'selected':
									B.selected = Z && typeof Z !== 'function' && typeof Z !== 'symbol';
									break;
								default:
									T0(B, X, H, Z, G, null);
							}
					return;
				case 'dialog':
					(U0('beforetoggle', B), U0('toggle', B), U0('cancel', B), U0('close', B));
					break;
				case 'iframe':
				case 'object':
					U0('load', B);
					break;
				case 'video':
				case 'audio':
					for (Z = 0; Z < q4.length; Z++) U0(q4[Z], B);
					break;
				case 'image':
					(U0('error', B), U0('load', B));
					break;
				case 'details':
					U0('toggle', B);
					break;
				case 'embed':
				case 'source':
				case 'link':
					(U0('error', B), U0('load', B));
				case 'area':
				case 'base':
				case 'br':
				case 'col':
				case 'hr':
				case 'keygen':
				case 'meta':
				case 'param':
				case 'track':
				case 'wbr':
				case 'menuitem':
					for (J in G)
						if (G.hasOwnProperty(J) && ((Z = G[J]), Z != null))
							switch (J) {
								case 'children':
								case 'dangerouslySetInnerHTML':
									throw Error(
										X +
											' is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.',
									);
								default:
									T0(B, X, J, Z, G, null);
							}
					return;
				default:
					if (oX(X)) {
						for (w in G)
							G.hasOwnProperty(w) && ((Z = G[w]), Z !== void 0 && C8(B, X, w, Z, G, void 0));
						return;
					}
			}
			for (z in G) G.hasOwnProperty(z) && ((Z = G[z]), Z != null && T0(B, X, z, Z, G, null));
		}
		function CM(B, X, G, Z) {
			switch ((V8(X, Z), X)) {
				case 'div':
				case 'span':
				case 'svg':
				case 'path':
				case 'a':
				case 'g':
				case 'p':
				case 'li':
					break;
				case 'input':
					var Y = null,
						$ = null,
						R = null,
						z = null,
						H = null,
						J = null,
						w = null;
					for (_ in G) {
						var K = G[_];
						if (G.hasOwnProperty(_) && K != null)
							switch (_) {
								case 'checked':
									break;
								case 'value':
									break;
								case 'defaultValue':
									H = K;
								default:
									Z.hasOwnProperty(_) || T0(B, X, _, null, Z, K);
							}
					}
					for (var M in Z) {
						var _ = Z[M];
						if (((K = G[M]), Z.hasOwnProperty(M) && (_ != null || K != null)))
							switch (M) {
								case 'type':
									$ = _;
									break;
								case 'name':
									Y = _;
									break;
								case 'checked':
									J = _;
									break;
								case 'defaultChecked':
									w = _;
									break;
								case 'value':
									R = _;
									break;
								case 'defaultValue':
									z = _;
									break;
								case 'children':
								case 'dangerouslySetInnerHTML':
									if (_ != null)
										throw Error(
											X +
												' is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.',
										);
									break;
								default:
									_ !== K && T0(B, X, M, _, Z, K);
							}
					}
					((X = G.type === 'checkbox' || G.type === 'radio' ? G.checked != null : G.value != null),
						(Z = Z.type === 'checkbox' || Z.type === 'radio' ? Z.checked != null : Z.value != null),
						X ||
							!Z ||
							gU ||
							(console.error(
								'A component is changing an uncontrolled input to be controlled. This is likely caused by the value changing from undefined to a defined value, which should not happen. Decide between using a controlled or uncontrolled input element for the lifetime of the component. More info: https://react.dev/link/controlled-components',
							),
							(gU = !0)),
						!X ||
							Z ||
							SU ||
							(console.error(
								'A component is changing a controlled input to be uncontrolled. This is likely caused by the value changing from a defined to undefined, which should not happen. Decide between using a controlled or uncontrolled input element for the lifetime of the component. More info: https://react.dev/link/controlled-components',
							),
							(SU = !0)),
						d9(B, R, z, H, J, w, $, Y));
					return;
				case 'select':
					_ = R = z = M = null;
					for ($ in G)
						if (((H = G[$]), G.hasOwnProperty($) && H != null))
							switch ($) {
								case 'value':
									break;
								case 'multiple':
									_ = H;
								default:
									Z.hasOwnProperty($) || T0(B, X, $, null, Z, H);
							}
					for (Y in Z)
						if ((($ = Z[Y]), (H = G[Y]), Z.hasOwnProperty(Y) && ($ != null || H != null)))
							switch (Y) {
								case 'value':
									M = $;
									break;
								case 'defaultValue':
									z = $;
									break;
								case 'multiple':
									R = $;
								default:
									$ !== H && T0(B, X, Y, $, Z, H);
							}
					((Z = z),
						(X = R),
						(G = _),
						M != null
							? f1(B, !!X, M, !1)
							: !!G !== !!X && (Z != null ? f1(B, !!X, Z, !0) : f1(B, !!X, X ? [] : '', !1)));
					return;
				case 'textarea':
					_ = M = null;
					for (z in G)
						if (((Y = G[z]), G.hasOwnProperty(z) && Y != null && !Z.hasOwnProperty(z)))
							switch (z) {
								case 'value':
									break;
								case 'children':
									break;
								default:
									T0(B, X, z, null, Z, Y);
							}
					for (R in Z)
						if (((Y = Z[R]), ($ = G[R]), Z.hasOwnProperty(R) && (Y != null || $ != null)))
							switch (R) {
								case 'value':
									M = Y;
									break;
								case 'defaultValue':
									_ = Y;
									break;
								case 'children':
									break;
								case 'dangerouslySetInnerHTML':
									if (Y != null)
										throw Error('`dangerouslySetInnerHTML` does not make sense on <textarea>.');
									break;
								default:
									Y !== $ && T0(B, X, R, Y, Z, $);
							}
					TY(B, M, _);
					return;
				case 'option':
					for (var V in G)
						if (((M = G[V]), G.hasOwnProperty(V) && M != null && !Z.hasOwnProperty(V)))
							switch (V) {
								case 'selected':
									B.selected = !1;
									break;
								default:
									T0(B, X, V, null, Z, M);
							}
					for (H in Z)
						if (
							((M = Z[H]), (_ = G[H]), Z.hasOwnProperty(H) && M !== _ && (M != null || _ != null))
						)
							switch (H) {
								case 'selected':
									B.selected = M && typeof M !== 'function' && typeof M !== 'symbol';
									break;
								default:
									T0(B, X, H, M, Z, _);
							}
					return;
				case 'img':
				case 'link':
				case 'area':
				case 'base':
				case 'br':
				case 'col':
				case 'embed':
				case 'hr':
				case 'keygen':
				case 'meta':
				case 'param':
				case 'source':
				case 'track':
				case 'wbr':
				case 'menuitem':
					for (var S in G)
						((M = G[S]),
							G.hasOwnProperty(S) && M != null && !Z.hasOwnProperty(S) && T0(B, X, S, null, Z, M));
					for (J in Z)
						if (
							((M = Z[J]), (_ = G[J]), Z.hasOwnProperty(J) && M !== _ && (M != null || _ != null))
						)
							switch (J) {
								case 'children':
								case 'dangerouslySetInnerHTML':
									if (M != null)
										throw Error(
											X +
												' is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.',
										);
									break;
								default:
									T0(B, X, J, M, Z, _);
							}
					return;
				default:
					if (oX(X)) {
						for (var b0 in G)
							((M = G[b0]),
								G.hasOwnProperty(b0) &&
									M !== void 0 &&
									!Z.hasOwnProperty(b0) &&
									C8(B, X, b0, void 0, Z, M));
						for (w in Z)
							((M = Z[w]),
								(_ = G[w]),
								!Z.hasOwnProperty(w) ||
									M === _ ||
									(M === void 0 && _ === void 0) ||
									C8(B, X, w, M, Z, _));
						return;
					}
			}
			for (var Q0 in G)
				((M = G[Q0]),
					G.hasOwnProperty(Q0) && M != null && !Z.hasOwnProperty(Q0) && T0(B, X, Q0, null, Z, M));
			for (K in Z)
				((M = Z[K]),
					(_ = G[K]),
					!Z.hasOwnProperty(K) || M === _ || (M == null && _ == null) || T0(B, X, K, M, Z, _));
		}
		function mz(B) {
			switch (B) {
				case 'class':
					return 'className';
				case 'for':
					return 'htmlFor';
				default:
					return B;
			}
		}
		function D8(B) {
			var X = {};
			B = B.style;
			for (var G = 0; G < B.length; G++) {
				var Z = B[G];
				X[Z] = B.getPropertyValue(Z);
			}
			return X;
		}
		function yz(B, X, G) {
			if (X != null && typeof X !== 'object')
				console.error(
					"The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX.",
				);
			else {
				var Z,
					Y = (Z = ''),
					$;
				for ($ in X)
					if (X.hasOwnProperty($)) {
						var R = X[$];
						R != null &&
							typeof R !== 'boolean' &&
							R !== '' &&
							($.indexOf('--') === 0
								? (dX(R, $), (Z += Y + $ + ':' + ('' + R).trim()))
								: typeof R !== 'number' || R === 0 || oH.has($)
									? (dX(R, $),
										(Z +=
											Y +
											$.replace(sH, '-$1').toLowerCase().replace(lH, '-ms-') +
											':' +
											('' + R).trim()))
									: (Z +=
											Y + $.replace(sH, '-$1').toLowerCase().replace(lH, '-ms-') + ':' + R + 'px'),
							(Y = ';'));
					}
				((Z = Z || null),
					(X = B.getAttribute('style')),
					X !== Z && ((Z = QB(Z)), QB(X) !== Z && (G.style = D8(B))));
			}
		}
		function j5(B, X, G, Z, Y, $) {
			if ((Y.delete(G), (B = B.getAttribute(G)), B === null))
				switch (typeof Z) {
					case 'undefined':
					case 'function':
					case 'symbol':
					case 'boolean':
						return;
				}
			else if (Z != null)
				switch (typeof Z) {
					case 'function':
					case 'symbol':
					case 'boolean':
						break;
					default:
						if ((V0(Z, X), B === '' + Z)) return;
				}
			w2(X, B, Z, $);
		}
		function fz(B, X, G, Z, Y, $) {
			if ((Y.delete(G), (B = B.getAttribute(G)), B === null)) {
				switch (typeof Z) {
					case 'function':
					case 'symbol':
						return;
				}
				if (!Z) return;
			} else
				switch (typeof Z) {
					case 'function':
					case 'symbol':
						break;
					default:
						if (Z) return;
				}
			w2(X, B, Z, $);
		}
		function T8(B, X, G, Z, Y, $) {
			if ((Y.delete(G), (B = B.getAttribute(G)), B === null))
				switch (typeof Z) {
					case 'undefined':
					case 'function':
					case 'symbol':
						return;
				}
			else if (Z != null)
				switch (typeof Z) {
					case 'function':
					case 'symbol':
						break;
					default:
						if ((V0(Z, G), B === '' + Z)) return;
				}
			w2(X, B, Z, $);
		}
		function uz(B, X, G, Z, Y, $) {
			if ((Y.delete(G), (B = B.getAttribute(G)), B === null))
				switch (typeof Z) {
					case 'undefined':
					case 'function':
					case 'symbol':
					case 'boolean':
						return;
					default:
						if (isNaN(Z)) return;
				}
			else if (Z != null)
				switch (typeof Z) {
					case 'function':
					case 'symbol':
					case 'boolean':
						break;
					default:
						if (!isNaN(Z) && (V0(Z, X), B === '' + Z)) return;
				}
			w2(X, B, Z, $);
		}
		function v8(B, X, G, Z, Y, $) {
			if ((Y.delete(G), (B = B.getAttribute(G)), B === null))
				switch (typeof Z) {
					case 'undefined':
					case 'function':
					case 'symbol':
					case 'boolean':
						return;
				}
			else if (Z != null)
				switch (typeof Z) {
					case 'function':
					case 'symbol':
					case 'boolean':
						break;
					default:
						if ((V0(Z, X), (G = nX('' + Z)), B === G)) return;
				}
			w2(X, B, Z, $);
		}
		function hz(B, X, G, Z) {
			for (var Y = {}, $ = new Set(), R = B.attributes, z = 0; z < R.length; z++)
				switch (R[z].name.toLowerCase()) {
					case 'value':
						break;
					case 'checked':
						break;
					case 'selected':
						break;
					default:
						$.add(R[z].name);
				}
			if (oX(X)) {
				for (var H in G)
					if (G.hasOwnProperty(H)) {
						var J = G[H];
						if (J != null) {
							if (J1.hasOwnProperty(H)) typeof J !== 'function' && U6(H, J);
							else if (G.suppressHydrationWarning !== !0)
								switch (H) {
									case 'children':
										(typeof J !== 'string' && typeof J !== 'number') ||
											w2('children', B.textContent, J, Y);
										continue;
									case 'suppressContentEditableWarning':
									case 'suppressHydrationWarning':
									case 'defaultValue':
									case 'defaultChecked':
									case 'innerHTML':
									case 'ref':
										continue;
									case 'dangerouslySetInnerHTML':
										((R = B.innerHTML),
											(J = J ? J.__html : void 0),
											J != null && ((J = kz(B, J)), w2(H, R, J, Y)));
										continue;
									case 'style':
										($.delete(H), yz(B, J, Y));
										continue;
									case 'offsetParent':
									case 'offsetTop':
									case 'offsetLeft':
									case 'offsetWidth':
									case 'offsetHeight':
									case 'isContentEditable':
									case 'outerText':
									case 'outerHTML':
										($.delete(H.toLowerCase()),
											console.error(
												'Assignment to read-only property will result in a no-op: `%s`',
												H,
											));
										continue;
									case 'className':
										($.delete('class'), (R = FY(B, 'class', J)), w2('className', R, J, Y));
										continue;
									default:
										(Z.context === o6 && X !== 'svg' && X !== 'math'
											? $.delete(H.toLowerCase())
											: $.delete(H),
											(R = FY(B, H, J)),
											w2(H, R, J, Y));
								}
						}
					}
			} else
				for (J in G)
					if (G.hasOwnProperty(J) && ((H = G[J]), H != null)) {
						if (J1.hasOwnProperty(J)) typeof H !== 'function' && U6(J, H);
						else if (G.suppressHydrationWarning !== !0)
							switch (J) {
								case 'children':
									(typeof H !== 'string' && typeof H !== 'number') ||
										w2('children', B.textContent, H, Y);
									continue;
								case 'suppressContentEditableWarning':
								case 'suppressHydrationWarning':
								case 'value':
								case 'checked':
								case 'selected':
								case 'defaultValue':
								case 'defaultChecked':
								case 'innerHTML':
								case 'ref':
									continue;
								case 'dangerouslySetInnerHTML':
									((R = B.innerHTML),
										(H = H ? H.__html : void 0),
										H != null && ((H = kz(B, H)), R !== H && (Y[J] = { __html: R })));
									continue;
								case 'className':
									j5(B, J, 'class', H, $, Y);
									continue;
								case 'tabIndex':
									j5(B, J, 'tabindex', H, $, Y);
									continue;
								case 'style':
									($.delete(J), yz(B, H, Y));
									continue;
								case 'multiple':
									($.delete(J), w2(J, B.multiple, H, Y));
									continue;
								case 'muted':
									($.delete(J), w2(J, B.muted, H, Y));
									continue;
								case 'autoFocus':
									($.delete('autofocus'), w2(J, B.autofocus, H, Y));
									continue;
								case 'data':
									if (X !== 'object') {
										($.delete(J), (R = B.getAttribute('data')), w2(J, R, H, Y));
										continue;
									}
								case 'src':
								case 'href':
									if (!(
										H !== '' ||
										(X === 'a' && J === 'href') ||
										(X === 'object' && J === 'data')
									)) {
										J === 'src'
											? console.error(
													'An empty string ("") was passed to the %s attribute. This may cause the browser to download the whole page again over the network. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
													J,
													J,
												)
											: console.error(
													'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
													J,
													J,
												);
										continue;
									}
									v8(B, J, J, H, $, Y);
									continue;
								case 'action':
								case 'formAction':
									if (((R = B.getAttribute(J)), typeof H === 'function')) {
										($.delete(J.toLowerCase()),
											J === 'formAction'
												? ($.delete('name'),
													$.delete('formenctype'),
													$.delete('formmethod'),
													$.delete('formtarget'))
												: ($.delete('enctype'), $.delete('method'), $.delete('target')));
										continue;
									} else if (R === dW) {
										($.delete(J.toLowerCase()), w2(J, 'function', H, Y));
										continue;
									}
									v8(B, J, J.toLowerCase(), H, $, Y);
									continue;
								case 'xlinkHref':
									v8(B, J, 'xlink:href', H, $, Y);
									continue;
								case 'contentEditable':
									T8(B, J, 'contenteditable', H, $, Y);
									continue;
								case 'spellCheck':
									T8(B, J, 'spellcheck', H, $, Y);
									continue;
								case 'draggable':
								case 'autoReverse':
								case 'externalResourcesRequired':
								case 'focusable':
								case 'preserveAlpha':
									T8(B, J, J, H, $, Y);
									continue;
								case 'allowFullScreen':
								case 'async':
								case 'autoPlay':
								case 'controls':
								case 'default':
								case 'defer':
								case 'disabled':
								case 'disablePictureInPicture':
								case 'disableRemotePlayback':
								case 'formNoValidate':
								case 'hidden':
								case 'loop':
								case 'noModule':
								case 'noValidate':
								case 'open':
								case 'playsInline':
								case 'readOnly':
								case 'required':
								case 'reversed':
								case 'scoped':
								case 'seamless':
								case 'itemScope':
									fz(B, J, J.toLowerCase(), H, $, Y);
									continue;
								case 'capture':
								case 'download':
									B: {
										z = B;
										var w = (R = J),
											K = Y;
										if (($.delete(w), (z = z.getAttribute(w)), z === null))
											switch (typeof H) {
												case 'undefined':
												case 'function':
												case 'symbol':
													break B;
												default:
													if (H === !1) break B;
											}
										else if (H != null)
											switch (typeof H) {
												case 'function':
												case 'symbol':
													break;
												case 'boolean':
													if (H === !0 && z === '') break B;
													break;
												default:
													if ((V0(H, R), z === '' + H)) break B;
											}
										w2(R, z, H, K);
									}
									continue;
								case 'cols':
								case 'rows':
								case 'size':
								case 'span':
									B: {
										if (
											((z = B),
											(w = R = J),
											(K = Y),
											$.delete(w),
											(z = z.getAttribute(w)),
											z === null)
										)
											switch (typeof H) {
												case 'undefined':
												case 'function':
												case 'symbol':
												case 'boolean':
													break B;
												default:
													if (isNaN(H) || 1 > H) break B;
											}
										else if (H != null)
											switch (typeof H) {
												case 'function':
												case 'symbol':
												case 'boolean':
													break;
												default:
													if (!(isNaN(H) || 1 > H) && (V0(H, R), z === '' + H)) break B;
											}
										w2(R, z, H, K);
									}
									continue;
								case 'rowSpan':
									uz(B, J, 'rowspan', H, $, Y);
									continue;
								case 'start':
									uz(B, J, J, H, $, Y);
									continue;
								case 'xHeight':
									j5(B, J, 'x-height', H, $, Y);
									continue;
								case 'xlinkActuate':
									j5(B, J, 'xlink:actuate', H, $, Y);
									continue;
								case 'xlinkArcrole':
									j5(B, J, 'xlink:arcrole', H, $, Y);
									continue;
								case 'xlinkRole':
									j5(B, J, 'xlink:role', H, $, Y);
									continue;
								case 'xlinkShow':
									j5(B, J, 'xlink:show', H, $, Y);
									continue;
								case 'xlinkTitle':
									j5(B, J, 'xlink:title', H, $, Y);
									continue;
								case 'xlinkType':
									j5(B, J, 'xlink:type', H, $, Y);
									continue;
								case 'xmlBase':
									j5(B, J, 'xml:base', H, $, Y);
									continue;
								case 'xmlLang':
									j5(B, J, 'xml:lang', H, $, Y);
									continue;
								case 'xmlSpace':
									j5(B, J, 'xml:space', H, $, Y);
									continue;
								case 'inert':
									(H !== '' ||
										D9[J] ||
										((D9[J] = !0),
										console.error(
											'Received an empty string for a boolean attribute `%s`. This will treat the attribute as if it were false. Either pass `false` to silence this warning, or pass `true` if you used an empty string in earlier versions of React to indicate this attribute is true.',
											J,
										)),
										fz(B, J, J, H, $, Y));
									continue;
								default:
									if (
										!(2 < J.length) ||
										(J[0] !== 'o' && J[0] !== 'O') ||
										(J[1] !== 'n' && J[1] !== 'N')
									) {
										((z = dY(J)),
											(R = !1),
											Z.context === o6 && X !== 'svg' && X !== 'math'
												? $.delete(z.toLowerCase())
												: ((w = J.toLowerCase()),
													(w = d7.hasOwnProperty(w) ? d7[w] || null : null),
													w !== null && w !== J && ((R = !0), $.delete(w)),
													$.delete(z)));
										B: if (((w = B), (K = z), (z = H), lX(K)))
											if (w.hasAttribute(K))
												((w = w.getAttribute(K)), V0(z, K), (z = w === '' + z ? z : w));
											else {
												switch (typeof z) {
													case 'function':
													case 'symbol':
														break B;
													case 'boolean':
														if (((w = K.toLowerCase().slice(0, 5)), w !== 'data-' && w !== 'aria-'))
															break B;
												}
												z = z === void 0 ? void 0 : null;
											}
										else z = void 0;
										R || w2(J, z, H, Y);
									}
							}
					}
			return (
				0 < $.size && G.suppressHydrationWarning !== !0 && VM(B, $, Y),
				Object.keys(Y).length === 0 ? null : Y
			);
		}
		function DM(B, X) {
			switch (B.length) {
				case 0:
					return '';
				case 1:
					return B[0];
				case 2:
					return B[0] + ' ' + X + ' ' + B[1];
				default:
					return B.slice(0, -1).join(', ') + ', ' + X + ' ' + B[B.length - 1];
			}
		}
		function dz(B) {
			switch (B) {
				case 'css':
				case 'script':
				case 'font':
				case 'img':
				case 'image':
				case 'input':
				case 'link':
					return !0;
				default:
					return !1;
			}
		}
		function TM() {
			if (typeof performance.getEntriesByType === 'function') {
				for (
					var B = 0, X = 0, G = performance.getEntriesByType('resource'), Z = 0;
					Z < G.length;
					Z++
				) {
					var Y = G[Z],
						$ = Y.transferSize,
						R = Y.initiatorType,
						z = Y.duration;
					if ($ && z && dz(R)) {
						((R = 0), (z = Y.responseEnd));
						for (Z += 1; Z < G.length; Z++) {
							var H = G[Z],
								J = H.startTime;
							if (J > z) break;
							var { transferSize: w, initiatorType: K } = H;
							w && dz(K) && ((H = H.responseEnd), (R += w * (H < z ? 1 : (z - J) / (H - J))));
						}
						if ((--Z, (X += (8 * ($ + R)) / (Y.duration / 1000)), B++, 10 < B)) break;
					}
				}
				if (0 < B) return X / B / 1e6;
			}
			return navigator.connection && ((B = navigator.connection.downlink), typeof B === 'number')
				? B
				: 5;
		}
		function x7(B) {
			return B.nodeType === 9 ? B : B.ownerDocument;
		}
		function sz(B) {
			switch (B) {
				case HX:
					return yX;
				case h7:
					return v9;
				default:
					return o6;
			}
		}
		function lz(B, X) {
			if (B === o6)
				switch (X) {
					case 'svg':
						return yX;
					case 'math':
						return v9;
					default:
						return o6;
				}
			return B === yX && X === 'foreignObject' ? o6 : B;
		}
		function S8(B, X) {
			return (
				B === 'textarea' ||
				B === 'noscript' ||
				typeof X.children === 'string' ||
				typeof X.children === 'number' ||
				typeof X.children === 'bigint' ||
				(typeof X.dangerouslySetInnerHTML === 'object' &&
					X.dangerouslySetInnerHTML !== null &&
					X.dangerouslySetInnerHTML.__html != null)
			);
		}
		function vM() {
			var B = window.event;
			if (B && B.type === 'popstate') {
				if (B === wY) return !1;
				return ((wY = B), !0);
			}
			return ((wY = null), !1);
		}
		function A3() {
			var B = window.event;
			return B && B !== K4 ? B.type : null;
		}
		function j3() {
			var B = window.event;
			return B && B !== K4 ? B.timeStamp : -1.1;
		}
		function SM(B) {
			setTimeout(function () {
				throw B;
			});
		}
		function gM(B, X, G) {
			switch (X) {
				case 'button':
				case 'input':
				case 'select':
				case 'textarea':
					G.autoFocus && B.focus();
					break;
				case 'img':
					G.src ? (B.src = G.src) : G.srcSet && (B.srcset = G.srcSet);
			}
		}
		function kM() {}
		function bM(B, X, G, Z) {
			(CM(B, X, G, Z), (B[k2] = Z));
		}
		function pz(B) {
			aX(B, '');
		}
		function mM(B, X, G) {
			B.nodeValue = G;
		}
		function cz(B) {
			if (!B.__reactWarnedAboutChildrenConflict) {
				var X = B[k2] || null;
				if (X !== null) {
					var G = n(B);
					G !== null &&
						(typeof X.children === 'string' || typeof X.children === 'number'
							? ((B.__reactWarnedAboutChildrenConflict = !0),
								k(G, function () {
									console.error(
										'Cannot use a ref on a React element as a container to `createRoot` or `createPortal` if that element also sets "children" text content using React. It should be a leaf with no children. Otherwise it\'s ambiguous which children should be used.',
									);
								}))
							: X.dangerouslySetInnerHTML != null &&
								((B.__reactWarnedAboutChildrenConflict = !0),
								k(G, function () {
									console.error(
										'Cannot use a ref on a React element as a container to `createRoot` or `createPortal` if that element also sets "dangerouslySetInnerHTML" using React. It should be a leaf with no children. Otherwise it\'s ambiguous which children should be used.',
									);
								})));
				}
			}
		}
		function MB(B) {
			return B === 'head';
		}
		function yM(B, X) {
			B.removeChild(X);
		}
		function fM(B, X) {
			(B.nodeType === 9 ? B.body : B.nodeName === 'HTML' ? B.ownerDocument.body : B).removeChild(X);
		}
		function az(B, X) {
			var G = X,
				Z = 0;
			do {
				var Y = G.nextSibling;
				if ((B.removeChild(G), Y && Y.nodeType === 8))
					if (((G = Y.data), G === w4 || G === T9)) {
						if (Z === 0) {
							(B.removeChild(Y), GX(X));
							return;
						}
						Z--;
					} else if (G === W4 || G === bB || G === V1 || G === mX || G === I1) Z++;
					else if (G === lW) F3(B.ownerDocument.documentElement);
					else if (G === cW) {
						((G = B.ownerDocument.head), F3(G));
						for (var $ = G.firstChild; $;) {
							var { nextSibling: R, nodeName: z } = $;
							($[C3] ||
								z === 'SCRIPT' ||
								z === 'STYLE' ||
								(z === 'LINK' && $.rel.toLowerCase() === 'stylesheet') ||
								G.removeChild($),
								($ = R));
						}
					} else G === pW && F3(B.ownerDocument.body);
				G = Y;
			} while (G);
			GX(X);
		}
		function oz(B, X) {
			var G = B;
			B = 0;
			do {
				var Z = G.nextSibling;
				if (
					(G.nodeType === 1
						? X
							? ((G._stashedDisplay = G.style.display), (G.style.display = 'none'))
							: ((G.style.display = G._stashedDisplay || ''),
								G.getAttribute('style') === '' && G.removeAttribute('style'))
						: G.nodeType === 3 &&
							(X
								? ((G._stashedText = G.nodeValue), (G.nodeValue = ''))
								: (G.nodeValue = G._stashedText || '')),
					Z && Z.nodeType === 8)
				)
					if (((G = Z.data), G === w4))
						if (B === 0) break;
						else B--;
					else (G !== W4 && G !== bB && G !== V1 && G !== mX) || B++;
				G = Z;
			} while (G);
		}
		function uM(B) {
			oz(B, !0);
		}
		function hM(B) {
			((B = B.style),
				typeof B.setProperty === 'function'
					? B.setProperty('display', 'none', 'important')
					: (B.display = 'none'));
		}
		function dM(B) {
			B.nodeValue = '';
		}
		function sM(B) {
			oz(B, !1);
		}
		function lM(B, X) {
			((X = X[aW]),
				(X = X !== void 0 && X !== null && X.hasOwnProperty('display') ? X.display : null),
				(B.style.display = X == null || typeof X === 'boolean' ? '' : ('' + X).trim()));
		}
		function pM(B, X) {
			B.nodeValue = X;
		}
		function g8(B) {
			var X = B.firstChild;
			X && X.nodeType === 10 && (X = X.nextSibling);
			for (; X;) {
				var G = X;
				switch (((X = X.nextSibling), G.nodeName)) {
					case 'HTML':
					case 'HEAD':
					case 'BODY':
						(g8(G), C(G));
						continue;
					case 'SCRIPT':
					case 'STYLE':
						continue;
					case 'LINK':
						if (G.rel.toLowerCase() === 'stylesheet') continue;
				}
				B.removeChild(G);
			}
		}
		function cM(B, X, G, Z) {
			for (; B.nodeType === 1;) {
				var Y = G;
				if (B.nodeName.toLowerCase() !== X.toLowerCase()) {
					if (!Z && (B.nodeName !== 'INPUT' || B.type !== 'hidden')) break;
				} else if (!Z)
					if (X === 'input' && B.type === 'hidden') {
						V0(Y.name, 'name');
						var $ = Y.name == null ? null : '' + Y.name;
						if (Y.type === 'hidden' && B.getAttribute('name') === $) return B;
					} else return B;
				else if (!B[C3])
					switch (X) {
						case 'meta':
							if (!B.hasAttribute('itemprop')) break;
							return B;
						case 'link':
							if (
								(($ = B.getAttribute('rel')),
								$ === 'stylesheet' && B.hasAttribute('data-precedence'))
							)
								break;
							else if (
								$ !== Y.rel ||
								B.getAttribute('href') !== (Y.href == null || Y.href === '' ? null : Y.href) ||
								B.getAttribute('crossorigin') !== (Y.crossOrigin == null ? null : Y.crossOrigin) ||
								B.getAttribute('title') !== (Y.title == null ? null : Y.title)
							)
								break;
							return B;
						case 'style':
							if (B.hasAttribute('data-precedence')) break;
							return B;
						case 'script':
							if (
								(($ = B.getAttribute('src')),
								($ !== (Y.src == null ? null : Y.src) ||
									B.getAttribute('type') !== (Y.type == null ? null : Y.type) ||
									B.getAttribute('crossorigin') !==
										(Y.crossOrigin == null ? null : Y.crossOrigin)) &&
									$ &&
									B.hasAttribute('async') &&
									!B.hasAttribute('itemprop'))
							)
								break;
							return B;
						default:
							return B;
					}
				if (((B = H5(B.nextSibling)), B === null)) break;
			}
			return null;
		}
		function aM(B, X, G) {
			if (X === '') return null;
			for (; B.nodeType !== 3;) {
				if ((B.nodeType !== 1 || B.nodeName !== 'INPUT' || B.type !== 'hidden') && !G) return null;
				if (((B = H5(B.nextSibling)), B === null)) return null;
			}
			return B;
		}
		function nz(B, X) {
			for (; B.nodeType !== 8;) {
				if ((B.nodeType !== 1 || B.nodeName !== 'INPUT' || B.type !== 'hidden') && !X) return null;
				if (((B = H5(B.nextSibling)), B === null)) return null;
			}
			return B;
		}
		function k8(B) {
			return B.data === bB || B.data === V1;
		}
		function b8(B) {
			return B.data === mX || (B.data === bB && B.ownerDocument.readyState !== yU);
		}
		function oM(B, X) {
			var G = B.ownerDocument;
			if (B.data === V1) B._reactRetry = X;
			else if (B.data !== bB || G.readyState !== yU) X();
			else {
				var Z = function () {
					(X(), G.removeEventListener('DOMContentLoaded', Z));
				};
				(G.addEventListener('DOMContentLoaded', Z), (B._reactRetry = Z));
			}
		}
		function H5(B) {
			for (; B != null; B = B.nextSibling) {
				var X = B.nodeType;
				if (X === 1 || X === 3) break;
				if (X === 8) {
					if (
						((X = B.data),
						X === W4 || X === mX || X === bB || X === V1 || X === I1 || X === MY || X === mU)
					)
						break;
					if (X === w4 || X === T9) return null;
				}
			}
			return B;
		}
		function iz(B) {
			if (B.nodeType === 1) {
				for (var X = B.nodeName.toLowerCase(), G = {}, Z = B.attributes, Y = 0; Y < Z.length; Y++) {
					var $ = Z[Y];
					G[mz($.name)] = $.name.toLowerCase() === 'style' ? D8(B) : $.value;
				}
				return { type: X, props: G };
			}
			return B.nodeType === 8
				? B.data === I1
					? { type: 'Activity', props: {} }
					: { type: 'Suspense', props: {} }
				: B.nodeValue;
		}
		function tz(B, X, G) {
			return G === null || G[sW] !== !0
				? (B.nodeValue === X
						? (B = null)
						: ((X = QB(X)), (B = QB(B.nodeValue) === X ? null : B.nodeValue)),
					B)
				: null;
		}
		function m8(B) {
			B = B.nextSibling;
			for (var X = 0; B;) {
				if (B.nodeType === 8) {
					var G = B.data;
					if (G === w4 || G === T9) {
						if (X === 0) return H5(B.nextSibling);
						X--;
					} else (G !== W4 && G !== mX && G !== bB && G !== V1 && G !== I1) || X++;
				}
				B = B.nextSibling;
			}
			return null;
		}
		function rz(B) {
			B = B.previousSibling;
			for (var X = 0; B;) {
				if (B.nodeType === 8) {
					var G = B.data;
					if (G === W4 || G === mX || G === bB || G === V1 || G === I1) {
						if (X === 0) return B;
						X--;
					} else (G !== w4 && G !== T9) || X++;
				}
				B = B.previousSibling;
			}
			return null;
		}
		function nM(B) {
			GX(B);
		}
		function iM(B) {
			GX(B);
		}
		function tM(B) {
			GX(B);
		}
		function ez(B, X, G, Z, Y) {
			switch ((Y && o9(B, Z.ancestorInfo), (X = x7(G)), B)) {
				case 'html':
					if (((B = X.documentElement), !B))
						throw Error(
							'React expected an <html> element (document.documentElement) to exist in the Document but one was not found. React never removes the documentElement for any Document it renders into so the cause is likely in some other script running on this page.',
						);
					return B;
				case 'head':
					if (((B = X.head), !B))
						throw Error(
							'React expected a <head> element (document.head) to exist in the Document but one was not found. React never removes the head for any Document it renders into so the cause is likely in some other script running on this page.',
						);
					return B;
				case 'body':
					if (((B = X.body), !B))
						throw Error(
							'React expected a <body> element (document.body) to exist in the Document but one was not found. React never removes the body for any Document it renders into so the cause is likely in some other script running on this page.',
						);
					return B;
				default:
					throw Error(
						'resolveSingletonInstance was called with an element type that is not supported. This is a bug in React.',
					);
			}
		}
		function rM(B, X, G, Z) {
			if (!G[KB] && n(G)) {
				var Y = G.tagName.toLowerCase();
				console.error(
					'You are mounting a new %s component when a previous one has not first unmounted. It is an error to render more than one %s component at a time and attributes and children of these components will likely fail in unpredictable ways. Please only render a single instance of <%s> and if you need to mount a new one, ensure any previous ones have unmounted first.',
					Y,
					Y,
					Y,
				);
			}
			switch (B) {
				case 'html':
				case 'head':
				case 'body':
					break;
				default:
					console.error(
						'acquireSingletonInstance was called with an element type that is not supported. This is a bug in React.',
					);
			}
			for (Y = G.attributes; Y.length;) G.removeAttributeNode(Y[0]);
			(x2(G, B, X), (G[N2] = Z), (G[k2] = X));
		}
		function F3(B) {
			for (var X = B.attributes; X.length;) B.removeAttributeNode(X[0]);
			C(B);
		}
		function N7(B) {
			return typeof B.getRootNode === 'function'
				? B.getRootNode()
				: B.nodeType === 9
					? B
					: B.ownerDocument;
		}
		function BH(B, X, G) {
			var Z = fX;
			if (Z && typeof X === 'string' && X) {
				var Y = A5(X);
				((Y = 'link[rel="' + B + '"][href="' + Y + '"]'),
					typeof G === 'string' && (Y += '[crossorigin="' + G + '"]'),
					lU.has(Y) ||
						(lU.add(Y),
						(B = { rel: B, crossOrigin: G, href: X }),
						Z.querySelector(Y) === null &&
							((X = Z.createElement('link')), x2(X, 'link', B), f(X), Z.head.appendChild(X))));
			}
		}
		function XH(B, X, G, Z) {
			var Y = (Y = WB.current) ? N7(Y) : null;
			if (!Y) throw Error('"resourceRoot" was expected to exist. This is a bug in React.');
			switch (B) {
				case 'meta':
				case 'title':
					return null;
				case 'style':
					return typeof G.precedence === 'string' && typeof G.href === 'string'
						? ((G = BX(G.href)),
							(X = W0(Y).hoistableStyles),
							(Z = X.get(G)),
							Z || ((Z = { type: 'style', instance: null, count: 0, state: null }), X.set(G, Z)),
							Z)
						: { type: 'void', instance: null, count: 0, state: null };
				case 'link':
					if (
						G.rel === 'stylesheet' &&
						typeof G.href === 'string' &&
						typeof G.precedence === 'string'
					) {
						B = BX(G.href);
						var $ = W0(Y).hoistableStyles,
							R = $.get(B);
						if (
							!R &&
							((Y = Y.ownerDocument || Y),
							(R = {
								type: 'stylesheet',
								instance: null,
								count: 0,
								state: { loading: D1, preload: null },
							}),
							$.set(B, R),
							($ = Y.querySelector(P3(B))) &&
								!$._p &&
								((R.instance = $), (R.state.loading = O4 | v5)),
							!S5.has(B))
						) {
							var z = {
								rel: 'preload',
								as: 'style',
								href: G.href,
								crossOrigin: G.crossOrigin,
								integrity: G.integrity,
								media: G.media,
								hrefLang: G.hrefLang,
								referrerPolicy: G.referrerPolicy,
							};
							(S5.set(B, z), $ || eM(Y, B, z, R.state));
						}
						if (X && Z === null)
							throw (
								(G =
									`

  - ` +
									E7(X) +
									`
  + ` +
									E7(G)),
								Error(
									'Expected <link> not to update to be updated to a stylesheet with precedence. Check the `rel`, `href`, and `precedence` props of this component. Alternatively, check whether two different <link> components render in the same slot or share the same key.' +
										G,
								)
							);
						return R;
					}
					if (X && Z !== null)
						throw (
							(G =
								`

  - ` +
								E7(X) +
								`
  + ` +
								E7(G)),
							Error(
								'Expected stylesheet with precedence to not be updated to a different kind of <link>. Check the `rel`, `href`, and `precedence` props of this component. Alternatively, check whether two different <link> components render in the same slot or share the same key.' +
									G,
							)
						);
					return null;
				case 'script':
					return (
						(X = G.async),
						(G = G.src),
						typeof G === 'string' && X && typeof X !== 'function' && typeof X !== 'symbol'
							? ((G = XX(G)),
								(X = W0(Y).hoistableScripts),
								(Z = X.get(G)),
								Z || ((Z = { type: 'script', instance: null, count: 0, state: null }), X.set(G, Z)),
								Z)
							: { type: 'void', instance: null, count: 0, state: null }
					);
				default:
					throw Error(
						'getResource encountered a type it did not expect: "' +
							B +
							'". this is a bug in React.',
					);
			}
		}
		function E7(B) {
			var X = 0,
				G = '<link';
			return (
				typeof B.rel === 'string'
					? (X++, (G += ' rel="' + B.rel + '"'))
					: m5.call(B, 'rel') &&
						(X++,
						(G += ' rel="' + (B.rel === null ? 'null' : 'invalid type ' + typeof B.rel) + '"')),
				typeof B.href === 'string'
					? (X++, (G += ' href="' + B.href + '"'))
					: m5.call(B, 'href') &&
						(X++,
						(G += ' href="' + (B.href === null ? 'null' : 'invalid type ' + typeof B.href) + '"')),
				typeof B.precedence === 'string'
					? (X++, (G += ' precedence="' + B.precedence + '"'))
					: m5.call(B, 'precedence') &&
						(X++,
						(G +=
							' precedence={' +
							(B.precedence === null ? 'null' : 'invalid type ' + typeof B.precedence) +
							'}')),
				Object.getOwnPropertyNames(B).length > X && (G += ' ...'),
				G + ' />'
			);
		}
		function BX(B) {
			return 'href="' + A5(B) + '"';
		}
		function P3(B) {
			return 'link[rel="stylesheet"][' + B + ']';
		}
		function GH(B) {
			return Y0({}, B, { 'data-precedence': B.precedence, precedence: null });
		}
		function eM(B, X, G, Z) {
			B.querySelector('link[rel="preload"][as="style"][' + X + ']')
				? (Z.loading = O4)
				: ((X = B.createElement('link')),
					(Z.preload = X),
					X.addEventListener('load', function () {
						return (Z.loading |= O4);
					}),
					X.addEventListener('error', function () {
						return (Z.loading |= dU);
					}),
					x2(X, 'link', G),
					f(X),
					B.head.appendChild(X));
		}
		function XX(B) {
			return '[src="' + A5(B) + '"]';
		}
		function x3(B) {
			return 'script[async]' + B;
		}
		function ZH(B, X, G) {
			if ((X.count++, X.instance === null))
				switch (X.type) {
					case 'style':
						var Z = B.querySelector('style[data-href~="' + A5(G.href) + '"]');
						if (Z) return ((X.instance = Z), f(Z), Z);
						var Y = Y0({}, G, {
							'data-href': G.href,
							'data-precedence': G.precedence,
							href: null,
							precedence: null,
						});
						return (
							(Z = (B.ownerDocument || B).createElement('style')),
							f(Z),
							x2(Z, 'style', Y),
							I7(Z, G.precedence, B),
							(X.instance = Z)
						);
					case 'stylesheet':
						Y = BX(G.href);
						var $ = B.querySelector(P3(Y));
						if ($) return ((X.state.loading |= v5), (X.instance = $), f($), $);
						((Z = GH(G)),
							(Y = S5.get(Y)) && y8(Z, Y),
							($ = (B.ownerDocument || B).createElement('link')),
							f($));
						var R = $;
						return (
							(R._p = new Promise(function (z, H) {
								((R.onload = z), (R.onerror = H));
							})),
							x2($, 'link', Z),
							(X.state.loading |= v5),
							I7($, G.precedence, B),
							(X.instance = $)
						);
					case 'script':
						if ((($ = XX(G.src)), (Y = B.querySelector(x3($))))) return ((X.instance = Y), f(Y), Y);
						if (((Z = G), (Y = S5.get($)))) ((Z = Y0({}, G)), f8(Z, Y));
						return (
							(B = B.ownerDocument || B),
							(Y = B.createElement('script')),
							f(Y),
							x2(Y, 'link', Z),
							B.head.appendChild(Y),
							(X.instance = Y)
						);
					case 'void':
						return null;
					default:
						throw Error(
							'acquireResource encountered a resource type it did not expect: "' +
								X.type +
								'". this is a bug in React.',
						);
				}
			else
				X.type === 'stylesheet' &&
					(X.state.loading & v5) === D1 &&
					((Z = X.instance), (X.state.loading |= v5), I7(Z, G.precedence, B));
			return X.instance;
		}
		function I7(B, X, G) {
			for (
				var Z = G.querySelectorAll(
						'link[rel="stylesheet"][data-precedence],style[data-precedence]',
					),
					Y = Z.length ? Z[Z.length - 1] : null,
					$ = Y,
					R = 0;
				R < Z.length;
				R++
			) {
				var z = Z[R];
				if (z.dataset.precedence === X) $ = z;
				else if ($ !== Y) break;
			}
			$
				? $.parentNode.insertBefore(B, $.nextSibling)
				: ((X = G.nodeType === 9 ? G.head : G), X.insertBefore(B, X.firstChild));
		}
		function y8(B, X) {
			(B.crossOrigin == null && (B.crossOrigin = X.crossOrigin),
				B.referrerPolicy == null && (B.referrerPolicy = X.referrerPolicy),
				B.title == null && (B.title = X.title));
		}
		function f8(B, X) {
			(B.crossOrigin == null && (B.crossOrigin = X.crossOrigin),
				B.referrerPolicy == null && (B.referrerPolicy = X.referrerPolicy),
				B.integrity == null && (B.integrity = X.integrity));
		}
		function YH(B, X, G) {
			if (S9 === null) {
				var Z = new Map(),
					Y = (S9 = new Map());
				Y.set(G, Z);
			} else ((Y = S9), (Z = Y.get(G)), Z || ((Z = new Map()), Y.set(G, Z)));
			if (Z.has(B)) return Z;
			(Z.set(B, null), (G = G.getElementsByTagName(B)));
			for (Y = 0; Y < G.length; Y++) {
				var $ = G[Y];
				if (
					!($[C3] || $[N2] || (B === 'link' && $.getAttribute('rel') === 'stylesheet')) &&
					$.namespaceURI !== HX
				) {
					var R = $.getAttribute(X) || '';
					R = B + R;
					var z = Z.get(R);
					z ? z.push($) : Z.set(R, [$]);
				}
			}
			return Z;
		}
		function $H(B, X, G) {
			((B = B.ownerDocument || B),
				B.head.insertBefore(G, X === 'title' ? B.querySelector('head > title') : null));
		}
		function Bq(B, X, G) {
			var Z = !G.ancestorInfo.containerTagInScope;
			if (G.context === yX || X.itemProp != null)
				return (
					!Z ||
						X.itemProp == null ||
						(B !== 'meta' && B !== 'title' && B !== 'style' && B !== 'link' && B !== 'script') ||
						console.error(
							'Cannot render a <%s> outside the main document if it has an `itemProp` prop. `itemProp` suggests the tag belongs to an `itemScope` which can appear anywhere in the DOM. If you were intending for React to hoist this <%s> remove the `itemProp` prop. Otherwise, try moving this tag into the <head> or <body> of the Document.',
							B,
							B,
						),
					!1
				);
			switch (B) {
				case 'meta':
				case 'title':
					return !0;
				case 'style':
					if (typeof X.precedence !== 'string' || typeof X.href !== 'string' || X.href === '') {
						Z &&
							console.error(
								'Cannot render a <style> outside the main document without knowing its precedence and a unique href key. React can hoist and deduplicate <style> tags if you provide a `precedence` prop along with an `href` prop that does not conflict with the `href` values used in any other hoisted <style> or <link rel="stylesheet" ...> tags.  Note that hoisting <style> tags is considered an advanced feature that most will not use directly. Consider moving the <style> tag to the <head> or consider adding a `precedence="default"` and `href="some unique resource identifier"`.',
							);
						break;
					}
					return !0;
				case 'link':
					if (
						typeof X.rel !== 'string' ||
						typeof X.href !== 'string' ||
						X.href === '' ||
						X.onLoad ||
						X.onError
					) {
						if (X.rel === 'stylesheet' && typeof X.precedence === 'string') {
							B = X.href;
							var { onError: Y, disabled: $ } = X;
							((G = []),
								X.onLoad && G.push('`onLoad`'),
								Y && G.push('`onError`'),
								$ != null && G.push('`disabled`'),
								(Y = DM(G, 'and')),
								(Y += G.length === 1 ? ' prop' : ' props'),
								($ = G.length === 1 ? 'an ' + Y : 'the ' + Y),
								G.length &&
									console.error(
										'React encountered a <link rel="stylesheet" href="%s" ... /> with a `precedence` prop that also included %s. The presence of loading and error handlers indicates an intent to manage the stylesheet loading state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the %s, otherwise remove the `precedence` prop.',
										B,
										$,
										Y,
									));
						}
						Z &&
							(typeof X.rel !== 'string' || typeof X.href !== 'string' || X.href === ''
								? console.error(
										'Cannot render a <link> outside the main document without a `rel` and `href` prop. Try adding a `rel` and/or `href` prop to this <link> or moving the link into the <head> tag',
									)
								: (X.onError || X.onLoad) &&
									console.error(
										'Cannot render a <link> with onLoad or onError listeners outside the main document. Try removing onLoad={...} and onError={...} or moving it into the root <head> tag or somewhere in the <body>.',
									));
						break;
					}
					switch (X.rel) {
						case 'stylesheet':
							return (
								(B = X.precedence),
								(X = X.disabled),
								typeof B !== 'string' &&
									Z &&
									console.error(
										'Cannot render a <link rel="stylesheet" /> outside the main document without knowing its precedence. Consider adding precedence="default" or moving it into the root <head> tag.',
									),
								typeof B === 'string' && X == null
							);
						default:
							return !0;
					}
				case 'script':
					if (
						((B = X.async && typeof X.async !== 'function' && typeof X.async !== 'symbol'),
						!B || X.onLoad || X.onError || !X.src || typeof X.src !== 'string')
					) {
						Z &&
							(B
								? X.onLoad || X.onError
									? console.error(
											'Cannot render a <script> with onLoad or onError listeners outside the main document. Try removing onLoad={...} and onError={...} or moving it into the root <head> tag or somewhere in the <body>.',
										)
									: console.error(
											'Cannot render a <script> outside the main document without `async={true}` and a non-empty `src` prop. Ensure there is a valid `src` and either make the script async or move it into the root <head> tag or somewhere in the <body>.',
										)
								: console.error(
										'Cannot render a sync or defer <script> outside the main document without knowing its order. Try adding async="" or moving it into the root <head> tag.',
									));
						break;
					}
					return !0;
				case 'noscript':
				case 'template':
					Z &&
						console.error(
							'Cannot render <%s> outside the main document. Try moving it into the root <head> tag.',
							B,
						);
			}
			return !1;
		}
		function RH(B) {
			return B.type === 'stylesheet' && (B.state.loading & sU) === D1 ? !1 : !0;
		}
		function Xq(B, X, G, Z) {
			if (
				G.type === 'stylesheet' &&
				(typeof Z.media !== 'string' || matchMedia(Z.media).matches !== !1) &&
				(G.state.loading & v5) === D1
			) {
				if (G.instance === null) {
					var Y = BX(Z.href),
						$ = X.querySelector(P3(Y));
					if ($) {
						((X = $._p),
							X !== null &&
								typeof X === 'object' &&
								typeof X.then === 'function' &&
								(B.count++, (B = V7.bind(B)), X.then(B, B)),
							(G.state.loading |= v5),
							(G.instance = $),
							f($));
						return;
					}
					(($ = X.ownerDocument || X),
						(Z = GH(Z)),
						(Y = S5.get(Y)) && y8(Z, Y),
						($ = $.createElement('link')),
						f($));
					var R = $;
					((R._p = new Promise(function (z, H) {
						((R.onload = z), (R.onerror = H));
					})),
						x2($, 'link', Z),
						(G.instance = $));
				}
				(B.stylesheets === null && (B.stylesheets = new Map()),
					B.stylesheets.set(G, X),
					(X = G.state.preload) &&
						(G.state.loading & sU) === D1 &&
						(B.count++,
						(G = V7.bind(B)),
						X.addEventListener('load', G),
						X.addEventListener('error', G)));
			}
		}
		function Gq(B, X) {
			return (
				B.stylesheets && B.count === 0 && C7(B, B.stylesheets),
				0 < B.count || 0 < B.imgCount
					? function (G) {
							var Z = setTimeout(function () {
								if ((B.stylesheets && C7(B, B.stylesheets), B.unsuspend)) {
									var $ = B.unsuspend;
									((B.unsuspend = null), $());
								}
							}, iW + X);
							0 < B.imgBytes && OY === 0 && (OY = 125 * TM() * rW);
							var Y = setTimeout(
								function () {
									if (
										((B.waitingForImages = !1),
										B.count === 0 && (B.stylesheets && C7(B, B.stylesheets), B.unsuspend))
									) {
										var $ = B.unsuspend;
										((B.unsuspend = null), $());
									}
								},
								(B.imgBytes > OY ? 50 : tW) + X,
							);
							return (
								(B.unsuspend = G),
								function () {
									((B.unsuspend = null), clearTimeout(Z), clearTimeout(Y));
								}
							);
						}
					: null
			);
		}
		function V7() {
			if ((this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages))) {
				if (this.stylesheets) C7(this, this.stylesheets);
				else if (this.unsuspend) {
					var B = this.unsuspend;
					((this.unsuspend = null), B());
				}
			}
		}
		function C7(B, X) {
			((B.stylesheets = null),
				B.unsuspend !== null &&
					(B.count++, (g9 = new Map()), X.forEach(Zq, B), (g9 = null), V7.call(B)));
		}
		function Zq(B, X) {
			if (!(X.state.loading & v5)) {
				var G = g9.get(B);
				if (G) var Z = G.get(_Y);
				else {
					((G = new Map()), g9.set(B, G));
					for (
						var Y = B.querySelectorAll('link[data-precedence],style[data-precedence]'), $ = 0;
						$ < Y.length;
						$++
					) {
						var R = Y[$];
						if (R.nodeName === 'LINK' || R.getAttribute('media') !== 'not all')
							(G.set(R.dataset.precedence, R), (Z = R));
					}
					Z && G.set(_Y, Z);
				}
				((Y = X.instance),
					(R = Y.getAttribute('data-precedence')),
					($ = G.get(R) || Z),
					$ === Z && G.set(_Y, Y),
					G.set(R, Y),
					this.count++,
					(Z = V7.bind(this)),
					Y.addEventListener('load', Z),
					Y.addEventListener('error', Z),
					$
						? $.parentNode.insertBefore(Y, $.nextSibling)
						: ((B = B.nodeType === 9 ? B.head : B), B.insertBefore(Y, B.firstChild)),
					(X.state.loading |= v5));
			}
		}
		function Yq(B, X, G, Z, Y, $, R, z, H) {
			((this.tag = 1),
				(this.containerInfo = B),
				(this.pingCache = this.current = this.pendingChildren = null),
				(this.timeoutHandle = C1),
				(this.callbackNode =
					this.next =
					this.pendingContext =
					this.context =
					this.cancelPendingCommit =
						null),
				(this.callbackPriority = 0),
				(this.expirationTimes = y1(-1)),
				(this.entangledLanes =
					this.shellSuspendCounter =
					this.errorRecoveryDisabledLanes =
					this.expiredLanes =
					this.warmLanes =
					this.pingedLanes =
					this.suspendedLanes =
					this.pendingLanes =
						0),
				(this.entanglements = y1(0)),
				(this.hiddenUpdates = y1(null)),
				(this.identifierPrefix = Z),
				(this.onUncaughtError = Y),
				(this.onCaughtError = $),
				(this.onRecoverableError = R),
				(this.pooledCache = null),
				(this.pooledCacheLanes = 0),
				(this.formState = H),
				(this.incompleteTransitions = new Map()),
				(this.passiveEffectDuration = this.effectDuration = -0),
				(this.memoizedUpdaters = new Set()),
				(B = this.pendingUpdatersLaneMap = []));
			for (X = 0; 31 > X; X++) B.push(new Set());
			this._debugRootType = G ? 'hydrateRoot()' : 'createRoot()';
		}
		function zH(B, X, G, Z, Y, $, R, z, H, J, w, K) {
			return (
				(B = new Yq(B, X, G, R, H, J, w, K, z)),
				(X = PW),
				$ === !0 && (X |= T2 | f5),
				(X |= e),
				($ = g(3, null, null, X)),
				(B.current = $),
				($.stateNode = B),
				(X = qG()),
				G1(X),
				(B.pooledCache = X),
				G1(X),
				($.memoizedState = { element: Z, isDehydrated: G, cache: X }),
				_G($),
				B
			);
		}
		function HH(B) {
			if (!B) return AB;
			return ((B = AB), B);
		}
		function u8(B, X, G, Z, Y, $) {
			if (D2 && typeof D2.onScheduleFiberRoot === 'function')
				try {
					D2.onScheduleFiberRoot(RX, Z, G);
				} catch (R) {
					W6 || ((W6 = !0), console.error('React instrumentation encountered an error: %o', R));
				}
			((Y = HH(Y)),
				Z.context === null ? (Z.context = Y) : (Z.pendingContext = Y),
				q6 &&
					U5 !== null &&
					!oU &&
					((oU = !0),
					console.error(
						`Render methods should be a pure function of props and state; triggering nested component updates from render is not allowed. If necessary, trigger nested updates in componentDidUpdate.

Check the render method of %s.`,
						v(U5) || 'Unknown',
					)),
				(Z = $B(X)),
				(Z.payload = { element: G }),
				($ = $ === void 0 ? null : $),
				$ !== null &&
					(typeof $ !== 'function' &&
						console.error(
							'Expected the last optional `callback` argument to be a function. Instead received: %s.',
							$,
						),
					(Z.callback = $)),
				(G = RB(B, Z, X)),
				G !== null && (r5(X, 'root.render()', null), n0(G, B, X), Y3(G, B, X)));
		}
		function JH(B, X) {
			if (((B = B.memoizedState), B !== null && B.dehydrated !== null)) {
				var G = B.retryLane;
				B.retryLane = G !== 0 && G < X ? G : X;
			}
		}
		function h8(B, X) {
			(JH(B, X), (B = B.alternate) && JH(B, X));
		}
		function UH(B) {
			if (B.tag === 13 || B.tag === 31) {
				var X = C2(B, 67108864);
				(X !== null && n0(X, B, 67108864), h8(B, 67108864));
			}
		}
		function QH(B) {
			if (B.tag === 13 || B.tag === 31) {
				var X = z5(B);
				X = aB(X);
				var G = C2(B, X);
				(G !== null && n0(G, B, X), h8(B, X));
			}
		}
		function $q() {
			return U5;
		}
		function Rq(B, X, G, Z) {
			var Y = A.T;
			A.T = null;
			var $ = L0.p;
			try {
				((L0.p = Q5), d8(B, X, G, Z));
			} finally {
				((L0.p = $), (A.T = Y));
			}
		}
		function zq(B, X, G, Z) {
			var Y = A.T;
			A.T = null;
			var $ = L0.p;
			try {
				((L0.p = y5), d8(B, X, G, Z));
			} finally {
				((L0.p = $), (A.T = Y));
			}
		}
		function d8(B, X, G, Z) {
			if (b9) {
				var Y = s8(Z);
				if (Y === null) (I8(B, X, Z, m9, G), qH(B, Z));
				else if (Hq(Y, B, X, G, Z)) Z.stopPropagation();
				else if ((qH(B, Z), X & 4 && -1 < Bw.indexOf(B))) {
					for (; Y !== null;) {
						var $ = n(Y);
						if ($ !== null)
							switch ($.tag) {
								case 3:
									if ((($ = $.stateNode), $.current.memoizedState.isDehydrated)) {
										var R = o5($.pendingLanes);
										if (R !== 0) {
											var z = $;
											z.pendingLanes |= 2;
											for (z.entangledLanes |= 2; R;) {
												var H = 1 << (31 - g2(R));
												((z.entanglements[1] |= H), (R &= ~H));
											}
											(J6($), (M0 & (q2 | w5)) === L2 && ((L9 = K2() + FU), _3(0, !1)));
										}
									}
									break;
								case 31:
								case 13:
									((z = C2($, 2)), z !== null && n0(z, $, 2), t1(), h8($, 2));
							}
						if ((($ = s8(Z)), $ === null && I8(B, X, Z, m9, G), $ === Y)) break;
						Y = $;
					}
					Y !== null && Z.stopPropagation();
				} else I8(B, X, Z, null, G);
			}
		}
		function s8(B) {
			return ((B = n9(B)), l8(B));
		}
		function l8(B) {
			if (((m9 = null), (B = b(B)), B !== null)) {
				var X = t2(B);
				if (X === null) B = null;
				else {
					var G = X.tag;
					if (G === 13) {
						if (((B = r2(X)), B !== null)) return B;
						B = null;
					} else if (G === 31) {
						if (((B = A2(X)), B !== null)) return B;
						B = null;
					} else if (G === 3) {
						if (X.stateNode.current.memoizedState.isDehydrated)
							return X.tag === 3 ? X.stateNode.containerInfo : null;
						B = null;
					} else X !== B && (B = null);
				}
			}
			return ((m9 = B), null);
		}
		function MH(B) {
			switch (B) {
				case 'beforetoggle':
				case 'cancel':
				case 'click':
				case 'close':
				case 'contextmenu':
				case 'copy':
				case 'cut':
				case 'auxclick':
				case 'dblclick':
				case 'dragend':
				case 'dragstart':
				case 'drop':
				case 'focusin':
				case 'focusout':
				case 'input':
				case 'invalid':
				case 'keydown':
				case 'keypress':
				case 'keyup':
				case 'mousedown':
				case 'mouseup':
				case 'paste':
				case 'pause':
				case 'play':
				case 'pointercancel':
				case 'pointerdown':
				case 'pointerup':
				case 'ratechange':
				case 'reset':
				case 'resize':
				case 'seeked':
				case 'submit':
				case 'toggle':
				case 'touchcancel':
				case 'touchend':
				case 'touchstart':
				case 'volumechange':
				case 'change':
				case 'selectionchange':
				case 'textInput':
				case 'compositionstart':
				case 'compositionend':
				case 'compositionupdate':
				case 'beforeblur':
				case 'afterblur':
				case 'beforeinput':
				case 'blur':
				case 'fullscreenchange':
				case 'focus':
				case 'hashchange':
				case 'popstate':
				case 'select':
				case 'selectstart':
					return Q5;
				case 'drag':
				case 'dragenter':
				case 'dragexit':
				case 'dragleave':
				case 'dragover':
				case 'mousemove':
				case 'mouseout':
				case 'mouseover':
				case 'pointermove':
				case 'pointerout':
				case 'pointerover':
				case 'scroll':
				case 'touchmove':
				case 'wheel':
				case 'mouseenter':
				case 'mouseleave':
				case 'pointerenter':
				case 'pointerleave':
					return y5;
				case 'message':
					switch (Oq()) {
						case ZZ:
							return Q5;
						case YZ:
							return y5;
						case $X:
						case _q:
							return K6;
						case $Z:
							return f7;
						default:
							return K6;
					}
				default:
					return K6;
			}
		}
		function qH(B, X) {
			switch (B) {
				case 'focusin':
				case 'focusout':
					mB = null;
					break;
				case 'dragenter':
				case 'dragleave':
					yB = null;
					break;
				case 'mouseover':
				case 'mouseout':
					fB = null;
					break;
				case 'pointerover':
				case 'pointerout':
					L4.delete(X.pointerId);
					break;
				case 'gotpointercapture':
				case 'lostpointercapture':
					A4.delete(X.pointerId);
			}
		}
		function N3(B, X, G, Z, Y, $) {
			if (B === null || B.nativeEvent !== $)
				return (
					(B = {
						blockedOn: X,
						domEventName: G,
						eventSystemFlags: Z,
						nativeEvent: $,
						targetContainers: [Y],
					}),
					X !== null && ((X = n(X)), X !== null && UH(X)),
					B
				);
			return (
				(B.eventSystemFlags |= Z),
				(X = B.targetContainers),
				Y !== null && X.indexOf(Y) === -1 && X.push(Y),
				B
			);
		}
		function Hq(B, X, G, Z, Y) {
			switch (X) {
				case 'focusin':
					return ((mB = N3(mB, B, X, G, Z, Y)), !0);
				case 'dragenter':
					return ((yB = N3(yB, B, X, G, Z, Y)), !0);
				case 'mouseover':
					return ((fB = N3(fB, B, X, G, Z, Y)), !0);
				case 'pointerover':
					var $ = Y.pointerId;
					return (L4.set($, N3(L4.get($) || null, B, X, G, Z, Y)), !0);
				case 'gotpointercapture':
					return (($ = Y.pointerId), A4.set($, N3(A4.get($) || null, B, X, G, Z, Y)), !0);
			}
			return !1;
		}
		function WH(B) {
			var X = b(B.target);
			if (X !== null) {
				var G = t2(X);
				if (G !== null) {
					if (((X = G.tag), X === 13)) {
						if (((X = r2(G)), X !== null)) {
							((B.blockedOn = X),
								N(B.priority, function () {
									QH(G);
								}));
							return;
						}
					} else if (X === 31) {
						if (((X = A2(G)), X !== null)) {
							((B.blockedOn = X),
								N(B.priority, function () {
									QH(G);
								}));
							return;
						}
					} else if (X === 3 && G.stateNode.current.memoizedState.isDehydrated) {
						B.blockedOn = G.tag === 3 ? G.stateNode.containerInfo : null;
						return;
					}
				}
			}
			B.blockedOn = null;
		}
		function D7(B) {
			if (B.blockedOn !== null) return !1;
			for (var X = B.targetContainers; 0 < X.length;) {
				var G = s8(B.nativeEvent);
				if (G === null) {
					G = B.nativeEvent;
					var Z = new G.constructor(G.type, G),
						Y = Z;
					(D3 !== null &&
						console.error(
							'Expected currently replaying event to be null. This error is likely caused by a bug in React. Please file an issue.',
						),
						(D3 = Y),
						G.target.dispatchEvent(Z),
						D3 === null &&
							console.error(
								'Expected currently replaying event to not be null. This error is likely caused by a bug in React. Please file an issue.',
							),
						(D3 = null));
				} else return ((X = n(G)), X !== null && UH(X), (B.blockedOn = G), !1);
				X.shift();
			}
			return !0;
		}
		function wH(B, X, G) {
			D7(B) && G.delete(X);
		}
		function Jq() {
			((LY = !1),
				mB !== null && D7(mB) && (mB = null),
				yB !== null && D7(yB) && (yB = null),
				fB !== null && D7(fB) && (fB = null),
				L4.forEach(wH),
				A4.forEach(wH));
		}
		function T7(B, X) {
			B.blockedOn === X &&
				((B.blockedOn = null),
				LY || ((LY = !0), w0.unstable_scheduleCallback(w0.unstable_NormalPriority, Jq)));
		}
		function KH(B) {
			y9 !== B &&
				((y9 = B),
				w0.unstable_scheduleCallback(w0.unstable_NormalPriority, function () {
					y9 === B && (y9 = null);
					for (var X = 0; X < B.length; X += 3) {
						var G = B[X],
							Z = B[X + 1],
							Y = B[X + 2];
						if (typeof Z !== 'function')
							if (l8(Z || G) === null) continue;
							else break;
						var $ = n(G);
						$ !== null &&
							(B.splice(X, 3),
							(X -= 3),
							(G = { pending: !0, data: Y, method: G.method, action: Z }),
							Object.freeze(G),
							lG($, G, Z, Y));
					}
				}));
		}
		function GX(B) {
			function X(H) {
				return T7(H, B);
			}
			(mB !== null && T7(mB, B),
				yB !== null && T7(yB, B),
				fB !== null && T7(fB, B),
				L4.forEach(X),
				A4.forEach(X));
			for (var G = 0; G < uB.length; G++) {
				var Z = uB[G];
				Z.blockedOn === B && (Z.blockedOn = null);
			}
			for (; 0 < uB.length && ((G = uB[0]), G.blockedOn === null);)
				(WH(G), G.blockedOn === null && uB.shift());
			if (((G = (B.ownerDocument || B).$$reactFormReplay), G != null))
				for (Z = 0; Z < G.length; Z += 3) {
					var Y = G[Z],
						$ = G[Z + 1],
						R = Y[k2] || null;
					if (typeof $ === 'function') R || KH(G);
					else if (R) {
						var z = null;
						if ($ && $.hasAttribute('formAction')) {
							if (((Y = $), (R = $[k2] || null))) z = R.formAction;
							else if (l8(Y) !== null) continue;
						} else z = R.action;
						(typeof z === 'function' ? (G[Z + 1] = z) : (G.splice(Z, 3), (Z -= 3)), KH(G));
					}
				}
		}
		function OH() {
			function B($) {
				$.canIntercept &&
					$.info === 'react-transition' &&
					$.intercept({
						handler: function () {
							return new Promise(function (R) {
								return (Y = R);
							});
						},
						focusReset: 'manual',
						scroll: 'manual',
					});
			}
			function X() {
				(Y !== null && (Y(), (Y = null)), Z || setTimeout(G, 20));
			}
			function G() {
				if (!Z && !navigation.transition) {
					var $ = navigation.currentEntry;
					$ &&
						$.url != null &&
						navigation.navigate($.url, {
							state: $.getState(),
							info: 'react-transition',
							history: 'replace',
						});
				}
			}
			if (typeof navigation === 'object') {
				var Z = !1,
					Y = null;
				return (
					navigation.addEventListener('navigate', B),
					navigation.addEventListener('navigatesuccess', X),
					navigation.addEventListener('navigateerror', X),
					setTimeout(G, 100),
					function () {
						((Z = !0),
							navigation.removeEventListener('navigate', B),
							navigation.removeEventListener('navigatesuccess', X),
							navigation.removeEventListener('navigateerror', X),
							Y !== null && (Y(), (Y = null)));
					}
				);
			}
		}
		function p8(B) {
			this._internalRoot = B;
		}
		function v7(B) {
			this._internalRoot = B;
		}
		function _H(B) {
			B[KB] &&
				(B._reactRootContainer
					? console.error(
							'You are calling ReactDOMClient.createRoot() on a container that was previously passed to ReactDOM.render(). This is not supported.',
						)
					: console.error(
							'You are calling ReactDOMClient.createRoot() on a container that has already been passed to createRoot() before. Instead, call root.render() on the existing root instead if you want to update it.',
						));
		}
		typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
			typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === 'function' &&
			__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var Y0 = Object.assign,
			Uq = Symbol.for('react.element'),
			Q6 = Symbol.for('react.transitional.element'),
			ZX = Symbol.for('react.portal'),
			YX = Symbol.for('react.fragment'),
			S7 = Symbol.for('react.strict_mode'),
			c8 = Symbol.for('react.profiler'),
			a8 = Symbol.for('react.consumer'),
			M6 = Symbol.for('react.context'),
			E3 = Symbol.for('react.forward_ref'),
			o8 = Symbol.for('react.suspense'),
			n8 = Symbol.for('react.suspense_list'),
			g7 = Symbol.for('react.memo'),
			J5 = Symbol.for('react.lazy'),
			i8 = Symbol.for('react.activity'),
			Qq = Symbol.for('react.memo_cache_sentinel'),
			LH = Symbol.iterator,
			Mq = Symbol.for('react.client.reference'),
			Q2 = Array.isArray,
			A = hX.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
			L0 = jY.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
			qq = Object.freeze({ pending: !1, data: null, method: null, action: null }),
			t8 = [],
			r8 = [],
			g6 = -1,
			qB = G2(null),
			I3 = G2(null),
			WB = G2(null),
			k7 = G2(null),
			V3 = 0,
			AH,
			jH,
			FH,
			PH,
			xH,
			NH,
			EH;
		P.__reactDisabledLog = !0;
		var e8,
			IH,
			BZ = !1,
			XZ = new (typeof WeakMap === 'function' ? WeakMap : Map)(),
			U5 = null,
			q6 = !1,
			m5 = Object.prototype.hasOwnProperty,
			GZ = w0.unstable_scheduleCallback,
			Wq = w0.unstable_cancelCallback,
			wq = w0.unstable_shouldYield,
			Kq = w0.unstable_requestPaint,
			K2 = w0.unstable_now,
			Oq = w0.unstable_getCurrentPriorityLevel,
			ZZ = w0.unstable_ImmediatePriority,
			YZ = w0.unstable_UserBlockingPriority,
			$X = w0.unstable_NormalPriority,
			_q = w0.unstable_LowPriority,
			$Z = w0.unstable_IdlePriority,
			Lq = w0.log,
			Aq = w0.unstable_setDisableYieldValue,
			RX = null,
			D2 = null,
			W6 = !1,
			w6 = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u',
			g2 = Math.clz32 ? Math.clz32 : P4,
			jq = Math.log,
			Fq = Math.LN2,
			b7 = 256,
			m7 = 262144,
			y7 = 4194304,
			Q5 = 2,
			y5 = 8,
			K6 = 32,
			f7 = 268435456,
			wB = Math.random().toString(36).slice(2),
			N2 = '__reactFiber$' + wB,
			k2 = '__reactProps$' + wB,
			KB = '__reactContainer$' + wB,
			RZ = '__reactEvents$' + wB,
			Pq = '__reactListeners$' + wB,
			xq = '__reactHandles$' + wB,
			VH = '__reactResources$' + wB,
			C3 = '__reactMarker$' + wB,
			CH = new Set(),
			J1 = {},
			zZ = {},
			Nq = { button: !0, checkbox: !0, image: !0, hidden: !0, radio: !0, reset: !0, submit: !0 },
			Eq = RegExp(
				'^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$',
			),
			DH = {},
			TH = {},
			Iq = /[\n"\\]/g,
			vH = !1,
			SH = !1,
			gH = !1,
			kH = !1,
			bH = !1,
			mH = !1,
			yH = ['value', 'defaultValue'],
			fH = !1,
			uH = /["'&<>\n\t]|^\s|\s$/,
			Vq =
				'address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input isindex li link listing main marquee menu menuitem meta nav noembed noframes noscript object ol p param plaintext pre script section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp'.split(
					' ',
				),
			hH = 'applet caption html table td th marquee object template foreignObject desc title'.split(
				' ',
			),
			Cq = hH.concat(['button']),
			Dq = 'dd dt li option optgroup p rp rt'.split(' '),
			dH = {
				current: null,
				formTag: null,
				aTagInScope: null,
				buttonTagInScope: null,
				nobrTagInScope: null,
				pTagInButtonScope: null,
				listItemTagAutoclosing: null,
				dlItemTagAutoclosing: null,
				containerTagInScope: null,
				implicitRootScope: !1,
			},
			u7 = {},
			HZ = {
				animation:
					'animationDelay animationDirection animationDuration animationFillMode animationIterationCount animationName animationPlayState animationTimingFunction'.split(
						' ',
					),
				background:
					'backgroundAttachment backgroundClip backgroundColor backgroundImage backgroundOrigin backgroundPositionX backgroundPositionY backgroundRepeat backgroundSize'.split(
						' ',
					),
				backgroundPosition: ['backgroundPositionX', 'backgroundPositionY'],
				border:
					'borderBottomColor borderBottomStyle borderBottomWidth borderImageOutset borderImageRepeat borderImageSlice borderImageSource borderImageWidth borderLeftColor borderLeftStyle borderLeftWidth borderRightColor borderRightStyle borderRightWidth borderTopColor borderTopStyle borderTopWidth'.split(
						' ',
					),
				borderBlockEnd: ['borderBlockEndColor', 'borderBlockEndStyle', 'borderBlockEndWidth'],
				borderBlockStart: [
					'borderBlockStartColor',
					'borderBlockStartStyle',
					'borderBlockStartWidth',
				],
				borderBottom: ['borderBottomColor', 'borderBottomStyle', 'borderBottomWidth'],
				borderColor: ['borderBottomColor', 'borderLeftColor', 'borderRightColor', 'borderTopColor'],
				borderImage: [
					'borderImageOutset',
					'borderImageRepeat',
					'borderImageSlice',
					'borderImageSource',
					'borderImageWidth',
				],
				borderInlineEnd: ['borderInlineEndColor', 'borderInlineEndStyle', 'borderInlineEndWidth'],
				borderInlineStart: [
					'borderInlineStartColor',
					'borderInlineStartStyle',
					'borderInlineStartWidth',
				],
				borderLeft: ['borderLeftColor', 'borderLeftStyle', 'borderLeftWidth'],
				borderRadius: [
					'borderBottomLeftRadius',
					'borderBottomRightRadius',
					'borderTopLeftRadius',
					'borderTopRightRadius',
				],
				borderRight: ['borderRightColor', 'borderRightStyle', 'borderRightWidth'],
				borderStyle: ['borderBottomStyle', 'borderLeftStyle', 'borderRightStyle', 'borderTopStyle'],
				borderTop: ['borderTopColor', 'borderTopStyle', 'borderTopWidth'],
				borderWidth: ['borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth'],
				columnRule: ['columnRuleColor', 'columnRuleStyle', 'columnRuleWidth'],
				columns: ['columnCount', 'columnWidth'],
				flex: ['flexBasis', 'flexGrow', 'flexShrink'],
				flexFlow: ['flexDirection', 'flexWrap'],
				font: 'fontFamily fontFeatureSettings fontKerning fontLanguageOverride fontSize fontSizeAdjust fontStretch fontStyle fontVariant fontVariantAlternates fontVariantCaps fontVariantEastAsian fontVariantLigatures fontVariantNumeric fontVariantPosition fontWeight lineHeight'.split(
					' ',
				),
				fontVariant:
					'fontVariantAlternates fontVariantCaps fontVariantEastAsian fontVariantLigatures fontVariantNumeric fontVariantPosition'.split(
						' ',
					),
				gap: ['columnGap', 'rowGap'],
				grid: 'gridAutoColumns gridAutoFlow gridAutoRows gridTemplateAreas gridTemplateColumns gridTemplateRows'.split(
					' ',
				),
				gridArea: ['gridColumnEnd', 'gridColumnStart', 'gridRowEnd', 'gridRowStart'],
				gridColumn: ['gridColumnEnd', 'gridColumnStart'],
				gridColumnGap: ['columnGap'],
				gridGap: ['columnGap', 'rowGap'],
				gridRow: ['gridRowEnd', 'gridRowStart'],
				gridRowGap: ['rowGap'],
				gridTemplate: ['gridTemplateAreas', 'gridTemplateColumns', 'gridTemplateRows'],
				listStyle: ['listStyleImage', 'listStylePosition', 'listStyleType'],
				margin: ['marginBottom', 'marginLeft', 'marginRight', 'marginTop'],
				marker: ['markerEnd', 'markerMid', 'markerStart'],
				mask: 'maskClip maskComposite maskImage maskMode maskOrigin maskPositionX maskPositionY maskRepeat maskSize'.split(
					' ',
				),
				maskPosition: ['maskPositionX', 'maskPositionY'],
				outline: ['outlineColor', 'outlineStyle', 'outlineWidth'],
				overflow: ['overflowX', 'overflowY'],
				padding: ['paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop'],
				placeContent: ['alignContent', 'justifyContent'],
				placeItems: ['alignItems', 'justifyItems'],
				placeSelf: ['alignSelf', 'justifySelf'],
				textDecoration: ['textDecorationColor', 'textDecorationLine', 'textDecorationStyle'],
				textEmphasis: ['textEmphasisColor', 'textEmphasisStyle'],
				transition: [
					'transitionDelay',
					'transitionDuration',
					'transitionProperty',
					'transitionTimingFunction',
				],
				wordWrap: ['overflowWrap'],
			},
			sH = /([A-Z])/g,
			lH = /^ms-/,
			Tq = /^(?:webkit|moz|o)[A-Z]/,
			vq = /^-ms-/,
			Sq = /-(.)/g,
			pH = /;\s*$/,
			zX = {},
			JZ = {},
			cH = !1,
			aH = !1,
			oH = new Set(
				'animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp'.split(
					' ',
				),
			),
			h7 = 'http://www.w3.org/1998/Math/MathML',
			HX = 'http://www.w3.org/2000/svg',
			gq = new Map([
				['acceptCharset', 'accept-charset'],
				['htmlFor', 'for'],
				['httpEquiv', 'http-equiv'],
				['crossOrigin', 'crossorigin'],
				['accentHeight', 'accent-height'],
				['alignmentBaseline', 'alignment-baseline'],
				['arabicForm', 'arabic-form'],
				['baselineShift', 'baseline-shift'],
				['capHeight', 'cap-height'],
				['clipPath', 'clip-path'],
				['clipRule', 'clip-rule'],
				['colorInterpolation', 'color-interpolation'],
				['colorInterpolationFilters', 'color-interpolation-filters'],
				['colorProfile', 'color-profile'],
				['colorRendering', 'color-rendering'],
				['dominantBaseline', 'dominant-baseline'],
				['enableBackground', 'enable-background'],
				['fillOpacity', 'fill-opacity'],
				['fillRule', 'fill-rule'],
				['floodColor', 'flood-color'],
				['floodOpacity', 'flood-opacity'],
				['fontFamily', 'font-family'],
				['fontSize', 'font-size'],
				['fontSizeAdjust', 'font-size-adjust'],
				['fontStretch', 'font-stretch'],
				['fontStyle', 'font-style'],
				['fontVariant', 'font-variant'],
				['fontWeight', 'font-weight'],
				['glyphName', 'glyph-name'],
				['glyphOrientationHorizontal', 'glyph-orientation-horizontal'],
				['glyphOrientationVertical', 'glyph-orientation-vertical'],
				['horizAdvX', 'horiz-adv-x'],
				['horizOriginX', 'horiz-origin-x'],
				['imageRendering', 'image-rendering'],
				['letterSpacing', 'letter-spacing'],
				['lightingColor', 'lighting-color'],
				['markerEnd', 'marker-end'],
				['markerMid', 'marker-mid'],
				['markerStart', 'marker-start'],
				['overlinePosition', 'overline-position'],
				['overlineThickness', 'overline-thickness'],
				['paintOrder', 'paint-order'],
				['panose-1', 'panose-1'],
				['pointerEvents', 'pointer-events'],
				['renderingIntent', 'rendering-intent'],
				['shapeRendering', 'shape-rendering'],
				['stopColor', 'stop-color'],
				['stopOpacity', 'stop-opacity'],
				['strikethroughPosition', 'strikethrough-position'],
				['strikethroughThickness', 'strikethrough-thickness'],
				['strokeDasharray', 'stroke-dasharray'],
				['strokeDashoffset', 'stroke-dashoffset'],
				['strokeLinecap', 'stroke-linecap'],
				['strokeLinejoin', 'stroke-linejoin'],
				['strokeMiterlimit', 'stroke-miterlimit'],
				['strokeOpacity', 'stroke-opacity'],
				['strokeWidth', 'stroke-width'],
				['textAnchor', 'text-anchor'],
				['textDecoration', 'text-decoration'],
				['textRendering', 'text-rendering'],
				['transformOrigin', 'transform-origin'],
				['underlinePosition', 'underline-position'],
				['underlineThickness', 'underline-thickness'],
				['unicodeBidi', 'unicode-bidi'],
				['unicodeRange', 'unicode-range'],
				['unitsPerEm', 'units-per-em'],
				['vAlphabetic', 'v-alphabetic'],
				['vHanging', 'v-hanging'],
				['vIdeographic', 'v-ideographic'],
				['vMathematical', 'v-mathematical'],
				['vectorEffect', 'vector-effect'],
				['vertAdvY', 'vert-adv-y'],
				['vertOriginX', 'vert-origin-x'],
				['vertOriginY', 'vert-origin-y'],
				['wordSpacing', 'word-spacing'],
				['writingMode', 'writing-mode'],
				['xmlnsXlink', 'xmlns:xlink'],
				['xHeight', 'x-height'],
			]),
			d7 = {
				accept: 'accept',
				acceptcharset: 'acceptCharset',
				'accept-charset': 'acceptCharset',
				accesskey: 'accessKey',
				action: 'action',
				allowfullscreen: 'allowFullScreen',
				alt: 'alt',
				as: 'as',
				async: 'async',
				autocapitalize: 'autoCapitalize',
				autocomplete: 'autoComplete',
				autocorrect: 'autoCorrect',
				autofocus: 'autoFocus',
				autoplay: 'autoPlay',
				autosave: 'autoSave',
				capture: 'capture',
				cellpadding: 'cellPadding',
				cellspacing: 'cellSpacing',
				challenge: 'challenge',
				charset: 'charSet',
				checked: 'checked',
				children: 'children',
				cite: 'cite',
				class: 'className',
				classid: 'classID',
				classname: 'className',
				cols: 'cols',
				colspan: 'colSpan',
				content: 'content',
				contenteditable: 'contentEditable',
				contextmenu: 'contextMenu',
				controls: 'controls',
				controlslist: 'controlsList',
				coords: 'coords',
				crossorigin: 'crossOrigin',
				dangerouslysetinnerhtml: 'dangerouslySetInnerHTML',
				data: 'data',
				datetime: 'dateTime',
				default: 'default',
				defaultchecked: 'defaultChecked',
				defaultvalue: 'defaultValue',
				defer: 'defer',
				dir: 'dir',
				disabled: 'disabled',
				disablepictureinpicture: 'disablePictureInPicture',
				disableremoteplayback: 'disableRemotePlayback',
				download: 'download',
				draggable: 'draggable',
				enctype: 'encType',
				enterkeyhint: 'enterKeyHint',
				fetchpriority: 'fetchPriority',
				for: 'htmlFor',
				form: 'form',
				formmethod: 'formMethod',
				formaction: 'formAction',
				formenctype: 'formEncType',
				formnovalidate: 'formNoValidate',
				formtarget: 'formTarget',
				frameborder: 'frameBorder',
				headers: 'headers',
				height: 'height',
				hidden: 'hidden',
				high: 'high',
				href: 'href',
				hreflang: 'hrefLang',
				htmlfor: 'htmlFor',
				httpequiv: 'httpEquiv',
				'http-equiv': 'httpEquiv',
				icon: 'icon',
				id: 'id',
				imagesizes: 'imageSizes',
				imagesrcset: 'imageSrcSet',
				inert: 'inert',
				innerhtml: 'innerHTML',
				inputmode: 'inputMode',
				integrity: 'integrity',
				is: 'is',
				itemid: 'itemID',
				itemprop: 'itemProp',
				itemref: 'itemRef',
				itemscope: 'itemScope',
				itemtype: 'itemType',
				keyparams: 'keyParams',
				keytype: 'keyType',
				kind: 'kind',
				label: 'label',
				lang: 'lang',
				list: 'list',
				loop: 'loop',
				low: 'low',
				manifest: 'manifest',
				marginwidth: 'marginWidth',
				marginheight: 'marginHeight',
				max: 'max',
				maxlength: 'maxLength',
				media: 'media',
				mediagroup: 'mediaGroup',
				method: 'method',
				min: 'min',
				minlength: 'minLength',
				multiple: 'multiple',
				muted: 'muted',
				name: 'name',
				nomodule: 'noModule',
				nonce: 'nonce',
				novalidate: 'noValidate',
				open: 'open',
				optimum: 'optimum',
				pattern: 'pattern',
				placeholder: 'placeholder',
				playsinline: 'playsInline',
				poster: 'poster',
				preload: 'preload',
				profile: 'profile',
				radiogroup: 'radioGroup',
				readonly: 'readOnly',
				referrerpolicy: 'referrerPolicy',
				rel: 'rel',
				required: 'required',
				reversed: 'reversed',
				role: 'role',
				rows: 'rows',
				rowspan: 'rowSpan',
				sandbox: 'sandbox',
				scope: 'scope',
				scoped: 'scoped',
				scrolling: 'scrolling',
				seamless: 'seamless',
				selected: 'selected',
				shape: 'shape',
				size: 'size',
				sizes: 'sizes',
				span: 'span',
				spellcheck: 'spellCheck',
				src: 'src',
				srcdoc: 'srcDoc',
				srclang: 'srcLang',
				srcset: 'srcSet',
				start: 'start',
				step: 'step',
				style: 'style',
				summary: 'summary',
				tabindex: 'tabIndex',
				target: 'target',
				title: 'title',
				type: 'type',
				usemap: 'useMap',
				value: 'value',
				width: 'width',
				wmode: 'wmode',
				wrap: 'wrap',
				about: 'about',
				accentheight: 'accentHeight',
				'accent-height': 'accentHeight',
				accumulate: 'accumulate',
				additive: 'additive',
				alignmentbaseline: 'alignmentBaseline',
				'alignment-baseline': 'alignmentBaseline',
				allowreorder: 'allowReorder',
				alphabetic: 'alphabetic',
				amplitude: 'amplitude',
				arabicform: 'arabicForm',
				'arabic-form': 'arabicForm',
				ascent: 'ascent',
				attributename: 'attributeName',
				attributetype: 'attributeType',
				autoreverse: 'autoReverse',
				azimuth: 'azimuth',
				basefrequency: 'baseFrequency',
				baselineshift: 'baselineShift',
				'baseline-shift': 'baselineShift',
				baseprofile: 'baseProfile',
				bbox: 'bbox',
				begin: 'begin',
				bias: 'bias',
				by: 'by',
				calcmode: 'calcMode',
				capheight: 'capHeight',
				'cap-height': 'capHeight',
				clip: 'clip',
				clippath: 'clipPath',
				'clip-path': 'clipPath',
				clippathunits: 'clipPathUnits',
				cliprule: 'clipRule',
				'clip-rule': 'clipRule',
				color: 'color',
				colorinterpolation: 'colorInterpolation',
				'color-interpolation': 'colorInterpolation',
				colorinterpolationfilters: 'colorInterpolationFilters',
				'color-interpolation-filters': 'colorInterpolationFilters',
				colorprofile: 'colorProfile',
				'color-profile': 'colorProfile',
				colorrendering: 'colorRendering',
				'color-rendering': 'colorRendering',
				contentscripttype: 'contentScriptType',
				contentstyletype: 'contentStyleType',
				cursor: 'cursor',
				cx: 'cx',
				cy: 'cy',
				d: 'd',
				datatype: 'datatype',
				decelerate: 'decelerate',
				descent: 'descent',
				diffuseconstant: 'diffuseConstant',
				direction: 'direction',
				display: 'display',
				divisor: 'divisor',
				dominantbaseline: 'dominantBaseline',
				'dominant-baseline': 'dominantBaseline',
				dur: 'dur',
				dx: 'dx',
				dy: 'dy',
				edgemode: 'edgeMode',
				elevation: 'elevation',
				enablebackground: 'enableBackground',
				'enable-background': 'enableBackground',
				end: 'end',
				exponent: 'exponent',
				externalresourcesrequired: 'externalResourcesRequired',
				fill: 'fill',
				fillopacity: 'fillOpacity',
				'fill-opacity': 'fillOpacity',
				fillrule: 'fillRule',
				'fill-rule': 'fillRule',
				filter: 'filter',
				filterres: 'filterRes',
				filterunits: 'filterUnits',
				floodopacity: 'floodOpacity',
				'flood-opacity': 'floodOpacity',
				floodcolor: 'floodColor',
				'flood-color': 'floodColor',
				focusable: 'focusable',
				fontfamily: 'fontFamily',
				'font-family': 'fontFamily',
				fontsize: 'fontSize',
				'font-size': 'fontSize',
				fontsizeadjust: 'fontSizeAdjust',
				'font-size-adjust': 'fontSizeAdjust',
				fontstretch: 'fontStretch',
				'font-stretch': 'fontStretch',
				fontstyle: 'fontStyle',
				'font-style': 'fontStyle',
				fontvariant: 'fontVariant',
				'font-variant': 'fontVariant',
				fontweight: 'fontWeight',
				'font-weight': 'fontWeight',
				format: 'format',
				from: 'from',
				fx: 'fx',
				fy: 'fy',
				g1: 'g1',
				g2: 'g2',
				glyphname: 'glyphName',
				'glyph-name': 'glyphName',
				glyphorientationhorizontal: 'glyphOrientationHorizontal',
				'glyph-orientation-horizontal': 'glyphOrientationHorizontal',
				glyphorientationvertical: 'glyphOrientationVertical',
				'glyph-orientation-vertical': 'glyphOrientationVertical',
				glyphref: 'glyphRef',
				gradienttransform: 'gradientTransform',
				gradientunits: 'gradientUnits',
				hanging: 'hanging',
				horizadvx: 'horizAdvX',
				'horiz-adv-x': 'horizAdvX',
				horizoriginx: 'horizOriginX',
				'horiz-origin-x': 'horizOriginX',
				ideographic: 'ideographic',
				imagerendering: 'imageRendering',
				'image-rendering': 'imageRendering',
				in2: 'in2',
				in: 'in',
				inlist: 'inlist',
				intercept: 'intercept',
				k1: 'k1',
				k2: 'k2',
				k3: 'k3',
				k4: 'k4',
				k: 'k',
				kernelmatrix: 'kernelMatrix',
				kernelunitlength: 'kernelUnitLength',
				kerning: 'kerning',
				keypoints: 'keyPoints',
				keysplines: 'keySplines',
				keytimes: 'keyTimes',
				lengthadjust: 'lengthAdjust',
				letterspacing: 'letterSpacing',
				'letter-spacing': 'letterSpacing',
				lightingcolor: 'lightingColor',
				'lighting-color': 'lightingColor',
				limitingconeangle: 'limitingConeAngle',
				local: 'local',
				markerend: 'markerEnd',
				'marker-end': 'markerEnd',
				markerheight: 'markerHeight',
				markermid: 'markerMid',
				'marker-mid': 'markerMid',
				markerstart: 'markerStart',
				'marker-start': 'markerStart',
				markerunits: 'markerUnits',
				markerwidth: 'markerWidth',
				mask: 'mask',
				maskcontentunits: 'maskContentUnits',
				maskunits: 'maskUnits',
				mathematical: 'mathematical',
				mode: 'mode',
				numoctaves: 'numOctaves',
				offset: 'offset',
				opacity: 'opacity',
				operator: 'operator',
				order: 'order',
				orient: 'orient',
				orientation: 'orientation',
				origin: 'origin',
				overflow: 'overflow',
				overlineposition: 'overlinePosition',
				'overline-position': 'overlinePosition',
				overlinethickness: 'overlineThickness',
				'overline-thickness': 'overlineThickness',
				paintorder: 'paintOrder',
				'paint-order': 'paintOrder',
				panose1: 'panose1',
				'panose-1': 'panose1',
				pathlength: 'pathLength',
				patterncontentunits: 'patternContentUnits',
				patterntransform: 'patternTransform',
				patternunits: 'patternUnits',
				pointerevents: 'pointerEvents',
				'pointer-events': 'pointerEvents',
				points: 'points',
				pointsatx: 'pointsAtX',
				pointsaty: 'pointsAtY',
				pointsatz: 'pointsAtZ',
				popover: 'popover',
				popovertarget: 'popoverTarget',
				popovertargetaction: 'popoverTargetAction',
				prefix: 'prefix',
				preservealpha: 'preserveAlpha',
				preserveaspectratio: 'preserveAspectRatio',
				primitiveunits: 'primitiveUnits',
				property: 'property',
				r: 'r',
				radius: 'radius',
				refx: 'refX',
				refy: 'refY',
				renderingintent: 'renderingIntent',
				'rendering-intent': 'renderingIntent',
				repeatcount: 'repeatCount',
				repeatdur: 'repeatDur',
				requiredextensions: 'requiredExtensions',
				requiredfeatures: 'requiredFeatures',
				resource: 'resource',
				restart: 'restart',
				result: 'result',
				results: 'results',
				rotate: 'rotate',
				rx: 'rx',
				ry: 'ry',
				scale: 'scale',
				security: 'security',
				seed: 'seed',
				shaperendering: 'shapeRendering',
				'shape-rendering': 'shapeRendering',
				slope: 'slope',
				spacing: 'spacing',
				specularconstant: 'specularConstant',
				specularexponent: 'specularExponent',
				speed: 'speed',
				spreadmethod: 'spreadMethod',
				startoffset: 'startOffset',
				stddeviation: 'stdDeviation',
				stemh: 'stemh',
				stemv: 'stemv',
				stitchtiles: 'stitchTiles',
				stopcolor: 'stopColor',
				'stop-color': 'stopColor',
				stopopacity: 'stopOpacity',
				'stop-opacity': 'stopOpacity',
				strikethroughposition: 'strikethroughPosition',
				'strikethrough-position': 'strikethroughPosition',
				strikethroughthickness: 'strikethroughThickness',
				'strikethrough-thickness': 'strikethroughThickness',
				string: 'string',
				stroke: 'stroke',
				strokedasharray: 'strokeDasharray',
				'stroke-dasharray': 'strokeDasharray',
				strokedashoffset: 'strokeDashoffset',
				'stroke-dashoffset': 'strokeDashoffset',
				strokelinecap: 'strokeLinecap',
				'stroke-linecap': 'strokeLinecap',
				strokelinejoin: 'strokeLinejoin',
				'stroke-linejoin': 'strokeLinejoin',
				strokemiterlimit: 'strokeMiterlimit',
				'stroke-miterlimit': 'strokeMiterlimit',
				strokewidth: 'strokeWidth',
				'stroke-width': 'strokeWidth',
				strokeopacity: 'strokeOpacity',
				'stroke-opacity': 'strokeOpacity',
				suppresscontenteditablewarning: 'suppressContentEditableWarning',
				suppresshydrationwarning: 'suppressHydrationWarning',
				surfacescale: 'surfaceScale',
				systemlanguage: 'systemLanguage',
				tablevalues: 'tableValues',
				targetx: 'targetX',
				targety: 'targetY',
				textanchor: 'textAnchor',
				'text-anchor': 'textAnchor',
				textdecoration: 'textDecoration',
				'text-decoration': 'textDecoration',
				textlength: 'textLength',
				textrendering: 'textRendering',
				'text-rendering': 'textRendering',
				to: 'to',
				transform: 'transform',
				transformorigin: 'transformOrigin',
				'transform-origin': 'transformOrigin',
				typeof: 'typeof',
				u1: 'u1',
				u2: 'u2',
				underlineposition: 'underlinePosition',
				'underline-position': 'underlinePosition',
				underlinethickness: 'underlineThickness',
				'underline-thickness': 'underlineThickness',
				unicode: 'unicode',
				unicodebidi: 'unicodeBidi',
				'unicode-bidi': 'unicodeBidi',
				unicoderange: 'unicodeRange',
				'unicode-range': 'unicodeRange',
				unitsperem: 'unitsPerEm',
				'units-per-em': 'unitsPerEm',
				unselectable: 'unselectable',
				valphabetic: 'vAlphabetic',
				'v-alphabetic': 'vAlphabetic',
				values: 'values',
				vectoreffect: 'vectorEffect',
				'vector-effect': 'vectorEffect',
				version: 'version',
				vertadvy: 'vertAdvY',
				'vert-adv-y': 'vertAdvY',
				vertoriginx: 'vertOriginX',
				'vert-origin-x': 'vertOriginX',
				vertoriginy: 'vertOriginY',
				'vert-origin-y': 'vertOriginY',
				vhanging: 'vHanging',
				'v-hanging': 'vHanging',
				videographic: 'vIdeographic',
				'v-ideographic': 'vIdeographic',
				viewbox: 'viewBox',
				viewtarget: 'viewTarget',
				visibility: 'visibility',
				vmathematical: 'vMathematical',
				'v-mathematical': 'vMathematical',
				vocab: 'vocab',
				widths: 'widths',
				wordspacing: 'wordSpacing',
				'word-spacing': 'wordSpacing',
				writingmode: 'writingMode',
				'writing-mode': 'writingMode',
				x1: 'x1',
				x2: 'x2',
				x: 'x',
				xchannelselector: 'xChannelSelector',
				xheight: 'xHeight',
				'x-height': 'xHeight',
				xlinkactuate: 'xlinkActuate',
				'xlink:actuate': 'xlinkActuate',
				xlinkarcrole: 'xlinkArcrole',
				'xlink:arcrole': 'xlinkArcrole',
				xlinkhref: 'xlinkHref',
				'xlink:href': 'xlinkHref',
				xlinkrole: 'xlinkRole',
				'xlink:role': 'xlinkRole',
				xlinkshow: 'xlinkShow',
				'xlink:show': 'xlinkShow',
				xlinktitle: 'xlinkTitle',
				'xlink:title': 'xlinkTitle',
				xlinktype: 'xlinkType',
				'xlink:type': 'xlinkType',
				xmlbase: 'xmlBase',
				'xml:base': 'xmlBase',
				xmllang: 'xmlLang',
				'xml:lang': 'xmlLang',
				xmlns: 'xmlns',
				'xml:space': 'xmlSpace',
				xmlnsxlink: 'xmlnsXlink',
				'xmlns:xlink': 'xmlnsXlink',
				xmlspace: 'xmlSpace',
				y1: 'y1',
				y2: 'y2',
				y: 'y',
				ychannelselector: 'yChannelSelector',
				z: 'z',
				zoomandpan: 'zoomAndPan',
			},
			nH = {
				'aria-current': 0,
				'aria-description': 0,
				'aria-details': 0,
				'aria-disabled': 0,
				'aria-hidden': 0,
				'aria-invalid': 0,
				'aria-keyshortcuts': 0,
				'aria-label': 0,
				'aria-roledescription': 0,
				'aria-autocomplete': 0,
				'aria-checked': 0,
				'aria-expanded': 0,
				'aria-haspopup': 0,
				'aria-level': 0,
				'aria-modal': 0,
				'aria-multiline': 0,
				'aria-multiselectable': 0,
				'aria-orientation': 0,
				'aria-placeholder': 0,
				'aria-pressed': 0,
				'aria-readonly': 0,
				'aria-required': 0,
				'aria-selected': 0,
				'aria-sort': 0,
				'aria-valuemax': 0,
				'aria-valuemin': 0,
				'aria-valuenow': 0,
				'aria-valuetext': 0,
				'aria-atomic': 0,
				'aria-busy': 0,
				'aria-live': 0,
				'aria-relevant': 0,
				'aria-dropeffect': 0,
				'aria-grabbed': 0,
				'aria-activedescendant': 0,
				'aria-colcount': 0,
				'aria-colindex': 0,
				'aria-colspan': 0,
				'aria-controls': 0,
				'aria-describedby': 0,
				'aria-errormessage': 0,
				'aria-flowto': 0,
				'aria-labelledby': 0,
				'aria-owns': 0,
				'aria-posinset': 0,
				'aria-rowcount': 0,
				'aria-rowindex': 0,
				'aria-rowspan': 0,
				'aria-setsize': 0,
				'aria-braillelabel': 0,
				'aria-brailleroledescription': 0,
				'aria-colindextext': 0,
				'aria-rowindextext': 0,
			},
			JX = {},
			kq = RegExp(
				'^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$',
			),
			bq = RegExp(
				'^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$',
			),
			iH = !1,
			b2 = {},
			tH = /^on./,
			mq = /^on[^A-Z]/,
			yq = RegExp(
				'^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$',
			),
			fq = RegExp(
				'^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$',
			),
			uq =
				/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i,
			D3 = null,
			UX = null,
			QX = null,
			UZ = !1,
			O6 = !(
				typeof window > 'u' ||
				typeof window.document > 'u' ||
				typeof window.document.createElement > 'u'
			),
			QZ = !1;
		if (O6)
			try {
				var T3 = {};
				(Object.defineProperty(T3, 'passive', {
					get: function () {
						QZ = !0;
					},
				}),
					window.addEventListener('test', T3, T3),
					window.removeEventListener('test', T3, T3));
			} catch (B) {
				QZ = !1;
			}
		var OB = null,
			MZ = null,
			s7 = null,
			U1 = {
				eventPhase: 0,
				bubbles: 0,
				cancelable: 0,
				timeStamp: function (B) {
					return B.timeStamp || Date.now();
				},
				defaultPrevented: 0,
				isTrusted: 0,
			},
			l7 = d2(U1),
			v3 = Y0({}, U1, { view: 0, detail: 0 }),
			hq = d2(v3),
			qZ,
			WZ,
			S3,
			p7 = Y0({}, v3, {
				screenX: 0,
				screenY: 0,
				clientX: 0,
				clientY: 0,
				pageX: 0,
				pageY: 0,
				ctrlKey: 0,
				shiftKey: 0,
				altKey: 0,
				metaKey: 0,
				getModifierState: i9,
				button: 0,
				buttons: 0,
				relatedTarget: function (B) {
					return B.relatedTarget === void 0
						? B.fromElement === B.srcElement
							? B.toElement
							: B.fromElement
						: B.relatedTarget;
				},
				movementX: function (B) {
					if ('movementX' in B) return B.movementX;
					return (
						B !== S3 &&
							(S3 && B.type === 'mousemove'
								? ((qZ = B.screenX - S3.screenX), (WZ = B.screenY - S3.screenY))
								: (WZ = qZ = 0),
							(S3 = B)),
						qZ
					);
				},
				movementY: function (B) {
					return 'movementY' in B ? B.movementY : WZ;
				},
			}),
			rH = d2(p7),
			dq = Y0({}, p7, { dataTransfer: 0 }),
			sq = d2(dq),
			lq = Y0({}, v3, { relatedTarget: 0 }),
			wZ = d2(lq),
			pq = Y0({}, U1, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }),
			cq = d2(pq),
			aq = Y0({}, U1, {
				clipboardData: function (B) {
					return 'clipboardData' in B ? B.clipboardData : window.clipboardData;
				},
			}),
			oq = d2(aq),
			nq = Y0({}, U1, { data: 0 }),
			eH = d2(nq),
			iq = eH,
			tq = {
				Esc: 'Escape',
				Spacebar: ' ',
				Left: 'ArrowLeft',
				Up: 'ArrowUp',
				Right: 'ArrowRight',
				Down: 'ArrowDown',
				Del: 'Delete',
				Win: 'OS',
				Menu: 'ContextMenu',
				Apps: 'ContextMenu',
				Scroll: 'ScrollLock',
				MozPrintableKey: 'Unidentified',
			},
			rq = {
				8: 'Backspace',
				9: 'Tab',
				12: 'Clear',
				13: 'Enter',
				16: 'Shift',
				17: 'Control',
				18: 'Alt',
				19: 'Pause',
				20: 'CapsLock',
				27: 'Escape',
				32: ' ',
				33: 'PageUp',
				34: 'PageDown',
				35: 'End',
				36: 'Home',
				37: 'ArrowLeft',
				38: 'ArrowUp',
				39: 'ArrowRight',
				40: 'ArrowDown',
				45: 'Insert',
				46: 'Delete',
				112: 'F1',
				113: 'F2',
				114: 'F3',
				115: 'F4',
				116: 'F5',
				117: 'F6',
				118: 'F7',
				119: 'F8',
				120: 'F9',
				121: 'F10',
				122: 'F11',
				123: 'F12',
				144: 'NumLock',
				145: 'ScrollLock',
				224: 'Meta',
			},
			eq = { Alt: 'altKey', Control: 'ctrlKey', Meta: 'metaKey', Shift: 'shiftKey' },
			BW = Y0({}, v3, {
				key: function (B) {
					if (B.key) {
						var X = tq[B.key] || B.key;
						if (X !== 'Unidentified') return X;
					}
					return B.type === 'keypress'
						? ((B = D4(B)), B === 13 ? 'Enter' : String.fromCharCode(B))
						: B.type === 'keydown' || B.type === 'keyup'
							? rq[B.keyCode] || 'Unidentified'
							: '';
				},
				code: 0,
				location: 0,
				ctrlKey: 0,
				shiftKey: 0,
				altKey: 0,
				metaKey: 0,
				repeat: 0,
				locale: 0,
				getModifierState: i9,
				charCode: function (B) {
					return B.type === 'keypress' ? D4(B) : 0;
				},
				keyCode: function (B) {
					return B.type === 'keydown' || B.type === 'keyup' ? B.keyCode : 0;
				},
				which: function (B) {
					return B.type === 'keypress'
						? D4(B)
						: B.type === 'keydown' || B.type === 'keyup'
							? B.keyCode
							: 0;
				},
			}),
			XW = d2(BW),
			GW = Y0({}, p7, {
				pointerId: 0,
				width: 0,
				height: 0,
				pressure: 0,
				tangentialPressure: 0,
				tiltX: 0,
				tiltY: 0,
				twist: 0,
				pointerType: 0,
				isPrimary: 0,
			}),
			BJ = d2(GW),
			ZW = Y0({}, v3, {
				touches: 0,
				targetTouches: 0,
				changedTouches: 0,
				altKey: 0,
				metaKey: 0,
				ctrlKey: 0,
				shiftKey: 0,
				getModifierState: i9,
			}),
			YW = d2(ZW),
			$W = Y0({}, U1, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }),
			RW = d2($W),
			zW = Y0({}, p7, {
				deltaX: function (B) {
					return 'deltaX' in B ? B.deltaX : 'wheelDeltaX' in B ? -B.wheelDeltaX : 0;
				},
				deltaY: function (B) {
					return 'deltaY' in B
						? B.deltaY
						: 'wheelDeltaY' in B
							? -B.wheelDeltaY
							: 'wheelDelta' in B
								? -B.wheelDelta
								: 0;
				},
				deltaZ: 0,
				deltaMode: 0,
			}),
			HW = d2(zW),
			JW = Y0({}, U1, { newState: 0, oldState: 0 }),
			UW = d2(JW),
			QW = [9, 13, 27, 32],
			XJ = 229,
			KZ = O6 && 'CompositionEvent' in window,
			g3 = null;
		O6 && 'documentMode' in document && (g3 = document.documentMode);
		var MW = O6 && 'TextEvent' in window && !g3,
			GJ = O6 && (!KZ || (g3 && 8 < g3 && 11 >= g3)),
			ZJ = 32,
			YJ = String.fromCharCode(ZJ),
			$J = !1,
			MX = !1,
			qW = {
				color: !0,
				date: !0,
				datetime: !0,
				'datetime-local': !0,
				email: !0,
				month: !0,
				number: !0,
				password: !0,
				range: !0,
				search: !0,
				tel: !0,
				text: !0,
				time: !0,
				url: !0,
				week: !0,
			},
			k3 = null,
			b3 = null,
			RJ = !1;
		O6 && (RJ = gQ('input') && (!document.documentMode || 9 < document.documentMode));
		var m2 = typeof Object.is === 'function' ? Object.is : uQ,
			WW = O6 && 'documentMode' in document && 11 >= document.documentMode,
			qX = null,
			OZ = null,
			m3 = null,
			_Z = !1,
			WX = {
				animationend: nB('Animation', 'AnimationEnd'),
				animationiteration: nB('Animation', 'AnimationIteration'),
				animationstart: nB('Animation', 'AnimationStart'),
				transitionrun: nB('Transition', 'TransitionRun'),
				transitionstart: nB('Transition', 'TransitionStart'),
				transitioncancel: nB('Transition', 'TransitionCancel'),
				transitionend: nB('Transition', 'TransitionEnd'),
			},
			LZ = {},
			zJ = {};
		O6 &&
			((zJ = document.createElement('div').style),
			'AnimationEvent' in window ||
				(delete WX.animationend.animation,
				delete WX.animationiteration.animation,
				delete WX.animationstart.animation),
			'TransitionEvent' in window || delete WX.transitionend.transition);
		var HJ = iB('animationend'),
			JJ = iB('animationiteration'),
			UJ = iB('animationstart'),
			wW = iB('transitionrun'),
			KW = iB('transitionstart'),
			OW = iB('transitioncancel'),
			QJ = iB('transitionend'),
			MJ = new Map(),
			AZ =
				'abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel'.split(
					' ',
				);
		AZ.push('scrollEnd');
		var qJ = 0;
		if (typeof performance === 'object' && typeof performance.now === 'function')
			var _W = performance,
				WJ = function () {
					return _W.now();
				};
		else {
			var LW = Date;
			WJ = function () {
				return LW.now();
			};
		}
		var jZ =
				typeof reportError === 'function'
					? reportError
					: function (B) {
							if (typeof window === 'object' && typeof window.ErrorEvent === 'function') {
								var X = new window.ErrorEvent('error', {
									bubbles: !0,
									cancelable: !0,
									message:
										typeof B === 'object' && B !== null && typeof B.message === 'string'
											? String(B.message)
											: String(B),
									error: B,
								});
								if (!window.dispatchEvent(X)) return;
							} else if (typeof process === 'object' && typeof process.emit === 'function') {
								process.emit('uncaughtException', B);
								return;
							}
							console.error(B);
						},
			AW =
				'This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects.',
			c7 = 0,
			FZ = 1,
			PZ = 2,
			xZ = 3,
			a7 = '– ',
			o7 = '+ ',
			wJ = '  ',
			y0 =
				typeof console < 'u' &&
				typeof console.timeStamp === 'function' &&
				typeof performance < 'u' &&
				typeof performance.measure === 'function',
			F5 = 'Components ⚛',
			$0 = 'Scheduler ⚛',
			R0 = 'Blocking',
			_B = !1,
			k6 = { color: 'primary', properties: null, tooltipText: '', track: F5 },
			LB = { start: -0, end: -0, detail: { devtools: k6 } },
			jW = ['Changed Props', ''],
			KJ =
				'This component received deeply equal props. It might benefit from useMemo or the React Compiler in its owner.',
			FW = ['Changed Props', KJ],
			y3 = 1,
			b6 = 2,
			P5 = [],
			wX = 0,
			NZ = 0,
			AB = {};
		Object.freeze(AB);
		var x5 = null,
			KX = null,
			p = 0,
			PW = 1,
			e = 2,
			T2 = 8,
			f5 = 16,
			xW = 32,
			OJ = !1;
		try {
			var _J = Object.preventExtensions({});
		} catch (B) {
			OJ = !0;
		}
		var EZ = new WeakMap(),
			OX = [],
			_X = 0,
			n7 = null,
			f3 = 0,
			N5 = [],
			E5 = 0,
			Q1 = null,
			m6 = 1,
			y6 = '',
			E2 = null,
			f0 = null,
			H0 = !1,
			_6 = !1,
			M5 = null,
			jB = null,
			I5 = !1,
			IZ = Error(
				"Hydration Mismatch Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React.",
			),
			VZ = G2(null),
			CZ = G2(null),
			LJ = {},
			i7 = null,
			LX = null,
			AX = !1,
			NW =
				typeof AbortController < 'u'
					? AbortController
					: function () {
							var B = [],
								X = (this.signal = {
									aborted: !1,
									addEventListener: function (G, Z) {
										B.push(Z);
									},
								});
							this.abort = function () {
								((X.aborted = !0),
									B.forEach(function (G) {
										return G();
									}));
							};
						},
			EW = w0.unstable_scheduleCallback,
			IW = w0.unstable_NormalPriority,
			Z2 = {
				$$typeof: M6,
				Consumer: null,
				Provider: null,
				_currentValue: null,
				_currentValue2: null,
				_threadCount: 0,
				_currentRenderer: null,
				_currentRenderer2: null,
			},
			Y2 = w0.unstable_now,
			t7 = console.createTask
				? console.createTask
				: function () {
						return null;
					},
			u3 = 1,
			r7 = 2,
			O2 = -0,
			FB = -0,
			f6 = -0,
			u6 = null,
			y2 = -1.1,
			M1 = -0,
			c0 = -0,
			u = -1.1,
			s = -1.1,
			s0 = null,
			i0 = !1,
			PB = -0,
			L6 = -1.1,
			h3 = null,
			xB = 0,
			DZ = null,
			TZ = null,
			q1 = -1.1,
			d3 = null,
			jX = -1.1,
			e7 = -1.1,
			A6 = -0,
			h6 = -1.1,
			V5 = -1.1,
			vZ = 0,
			s3 = null,
			AJ = null,
			jJ = null,
			NB = -1.1,
			W1 = null,
			EB = -1.1,
			B9 = -1.1,
			FJ = -0,
			PJ = -0,
			X9 = 0,
			d6 = null,
			xJ = 0,
			l3 = -1.1,
			G9 = !1,
			Z9 = !1,
			p3 = null,
			SZ = 0,
			w1 = 0,
			FX = null,
			NJ = A.S;
		A.S = function (B, X) {
			if (((AU = K2()), typeof X === 'object' && X !== null && typeof X.then === 'function')) {
				if (0 > h6 && 0 > V5) {
					h6 = Y2();
					var G = j3(),
						Z = A3();
					if (G !== EB || Z !== W1) EB = -1.1;
					((NB = G), (W1 = Z));
				}
				aQ(B, X);
			}
			NJ !== null && NJ(B, X);
		};
		var K1 = G2(null),
			u5 = {
				recordUnsafeLifecycleWarnings: function () {},
				flushPendingUnsafeLifecycleWarnings: function () {},
				recordLegacyContextWarning: function () {},
				flushLegacyContextWarning: function () {},
				discardPendingWarnings: function () {},
			},
			c3 = [],
			a3 = [],
			o3 = [],
			n3 = [],
			i3 = [],
			t3 = [],
			O1 = new Set();
		((u5.recordUnsafeLifecycleWarnings = function (B, X) {
			O1.has(B.type) ||
				(typeof X.componentWillMount === 'function' &&
					X.componentWillMount.__suppressDeprecationWarning !== !0 &&
					c3.push(B),
				B.mode & T2 && typeof X.UNSAFE_componentWillMount === 'function' && a3.push(B),
				typeof X.componentWillReceiveProps === 'function' &&
					X.componentWillReceiveProps.__suppressDeprecationWarning !== !0 &&
					o3.push(B),
				B.mode & T2 && typeof X.UNSAFE_componentWillReceiveProps === 'function' && n3.push(B),
				typeof X.componentWillUpdate === 'function' &&
					X.componentWillUpdate.__suppressDeprecationWarning !== !0 &&
					i3.push(B),
				B.mode & T2 && typeof X.UNSAFE_componentWillUpdate === 'function' && t3.push(B));
		}),
			(u5.flushPendingUnsafeLifecycleWarnings = function () {
				var B = new Set();
				0 < c3.length &&
					(c3.forEach(function (z) {
						(B.add(v(z) || 'Component'), O1.add(z.type));
					}),
					(c3 = []));
				var X = new Set();
				0 < a3.length &&
					(a3.forEach(function (z) {
						(X.add(v(z) || 'Component'), O1.add(z.type));
					}),
					(a3 = []));
				var G = new Set();
				0 < o3.length &&
					(o3.forEach(function (z) {
						(G.add(v(z) || 'Component'), O1.add(z.type));
					}),
					(o3 = []));
				var Z = new Set();
				0 < n3.length &&
					(n3.forEach(function (z) {
						(Z.add(v(z) || 'Component'), O1.add(z.type));
					}),
					(n3 = []));
				var Y = new Set();
				0 < i3.length &&
					(i3.forEach(function (z) {
						(Y.add(v(z) || 'Component'), O1.add(z.type));
					}),
					(i3 = []));
				var $ = new Set();
				if (
					(0 < t3.length &&
						(t3.forEach(function (z) {
							($.add(v(z) || 'Component'), O1.add(z.type));
						}),
						(t3 = [])),
					0 < X.size)
				) {
					var R = j(X);
					console.error(
						`Using UNSAFE_componentWillMount in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code with side effects to componentDidMount, and set initial state in the constructor.

Please update the following components: %s`,
						R,
					);
				}
				(0 < Z.size &&
					((R = j(Z)),
					console.error(
						`Using UNSAFE_componentWillReceiveProps in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state

Please update the following components: %s`,
						R,
					)),
					0 < $.size &&
						((R = j($)),
						console.error(
							`Using UNSAFE_componentWillUpdate in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.

Please update the following components: %s`,
							R,
						)),
					0 < B.size &&
						((R = j(B)),
						console.warn(
							`componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code with side effects to componentDidMount, and set initial state in the constructor.
* Rename componentWillMount to UNSAFE_componentWillMount to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`,
							R,
						)),
					0 < G.size &&
						((R = j(G)),
						console.warn(
							`componentWillReceiveProps has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state
* Rename componentWillReceiveProps to UNSAFE_componentWillReceiveProps to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`,
							R,
						)),
					0 < Y.size &&
						((R = j(Y)),
						console.warn(
							`componentWillUpdate has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* Rename componentWillUpdate to UNSAFE_componentWillUpdate to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`,
							R,
						)));
			}));
		var Y9 = new Map(),
			EJ = new Set();
		((u5.recordLegacyContextWarning = function (B, X) {
			var G = null;
			for (var Z = B; Z !== null;) (Z.mode & T2 && (G = Z), (Z = Z.return));
			G === null
				? console.error(
						'Expected to find a StrictMode component in a strict mode tree. This error is likely caused by a bug in React. Please file an issue.',
					)
				: !EJ.has(B.type) &&
					((Z = Y9.get(G)),
					B.type.contextTypes != null ||
						B.type.childContextTypes != null ||
						(X !== null && typeof X.getChildContext === 'function')) &&
					(Z === void 0 && ((Z = []), Y9.set(G, Z)), Z.push(B));
		}),
			(u5.flushLegacyContextWarning = function () {
				Y9.forEach(function (B) {
					if (B.length !== 0) {
						var X = B[0],
							G = new Set();
						B.forEach(function (Y) {
							(G.add(v(Y) || 'Component'), EJ.add(Y.type));
						});
						var Z = j(G);
						k(X, function () {
							console.error(
								`Legacy context API has been detected within a strict-mode tree.

The old API will be supported in all 16.x releases, but applications using it should migrate to the new version.

Please update the following components: %s

Learn more about this warning here: https://react.dev/link/legacy-context`,
								Z,
							);
						});
					}
				});
			}),
			(u5.discardPendingWarnings = function () {
				((c3 = []), (a3 = []), (o3 = []), (n3 = []), (i3 = []), (t3 = []), (Y9 = new Map()));
			}));
		var IJ = {
				react_stack_bottom_frame: function (B, X, G) {
					var Z = q6;
					q6 = !0;
					try {
						return B(X, G);
					} finally {
						q6 = Z;
					}
				},
			},
			gZ = IJ.react_stack_bottom_frame.bind(IJ),
			VJ = {
				react_stack_bottom_frame: function (B) {
					var X = q6;
					q6 = !0;
					try {
						return B.render();
					} finally {
						q6 = X;
					}
				},
			},
			CJ = VJ.react_stack_bottom_frame.bind(VJ),
			DJ = {
				react_stack_bottom_frame: function (B, X) {
					try {
						X.componentDidMount();
					} catch (G) {
						_0(B, B.return, G);
					}
				},
			},
			kZ = DJ.react_stack_bottom_frame.bind(DJ),
			TJ = {
				react_stack_bottom_frame: function (B, X, G, Z, Y) {
					try {
						X.componentDidUpdate(G, Z, Y);
					} catch ($) {
						_0(B, B.return, $);
					}
				},
			},
			vJ = TJ.react_stack_bottom_frame.bind(TJ),
			SJ = {
				react_stack_bottom_frame: function (B, X) {
					var G = X.stack;
					B.componentDidCatch(X.value, { componentStack: G !== null ? G : '' });
				},
			},
			VW = SJ.react_stack_bottom_frame.bind(SJ),
			gJ = {
				react_stack_bottom_frame: function (B, X, G) {
					try {
						G.componentWillUnmount();
					} catch (Z) {
						_0(B, X, Z);
					}
				},
			},
			kJ = gJ.react_stack_bottom_frame.bind(gJ),
			bJ = {
				react_stack_bottom_frame: function (B) {
					var X = B.create;
					return ((B = B.inst), (X = X()), (B.destroy = X));
				},
			},
			CW = bJ.react_stack_bottom_frame.bind(bJ),
			mJ = {
				react_stack_bottom_frame: function (B, X, G) {
					try {
						G();
					} catch (Z) {
						_0(B, X, Z);
					}
				},
			},
			DW = mJ.react_stack_bottom_frame.bind(mJ),
			yJ = {
				react_stack_bottom_frame: function (B) {
					var X = B._init;
					return X(B._payload);
				},
			},
			TW = yJ.react_stack_bottom_frame.bind(yJ),
			PX = Error(
				"Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`.",
			),
			bZ = Error(
				"Suspense Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React.",
			),
			$9 = Error(
				"Suspense Exception: This is not a real error! It's an implementation detail of `useActionState` to interrupt the current render. You must either rethrow it immediately, or move the `useActionState` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary.",
			),
			R9 = {
				then: function () {
					console.error(
						'Internal React error: A listener was unexpectedly attached to a "noop" thenable. This is a bug in React. Please file an issue.',
					);
				},
			},
			_1 = null,
			r3 = !1,
			xX = null,
			e3 = 0,
			B0 = null,
			mZ,
			fJ = (mZ = !1),
			uJ = {},
			hJ = {},
			dJ = {};
		I = function (B, X, G) {
			if (
				G !== null &&
				typeof G === 'object' &&
				G._store &&
				((!G._store.validated && G.key == null) || G._store.validated === 2)
			) {
				if (typeof G._store !== 'object')
					throw Error(
						'React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue.',
					);
				G._store.validated = 1;
				var Z = v(B),
					Y = Z || 'null';
				if (!uJ[Y]) {
					((uJ[Y] = !0), (G = G._owner), (B = B._debugOwner));
					var $ = '';
					(B &&
						typeof B.tag === 'number' &&
						(Y = v(B)) &&
						($ =
							`

Check the render method of \`` +
							Y +
							'`.'),
						$ ||
							(Z &&
								($ =
									`

Check the top-level render call using <` +
									Z +
									'>.')));
					var R = '';
					(G != null &&
						B !== G &&
						((Z = null),
						typeof G.tag === 'number' ? (Z = v(G)) : typeof G.name === 'string' && (Z = G.name),
						Z && (R = ' It was passed a child from ' + Z + '.')),
						k(X, function () {
							console.error(
								'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
								$,
								R,
							);
						}));
				}
			}
		};
		var L1 = g$(!0),
			sJ = g$(!1),
			lJ = 0,
			pJ = 1,
			cJ = 2,
			yZ = 3,
			IB = !1,
			aJ = !1,
			fZ = null,
			uZ = !1,
			NX = G2(null),
			z9 = G2(0),
			q5 = G2(null),
			C5 = null,
			EX = 1,
			B4 = 2,
			e0 = G2(0),
			H9 = 0,
			D5 = 1,
			f2 = 2,
			W5 = 4,
			u2 = 8,
			IX,
			oJ = new Set(),
			nJ = new Set(),
			hZ = new Set(),
			iJ = new Set(),
			s6 = 0,
			c = null,
			v0 = null,
			$2 = null,
			J9 = !1,
			VX = !1,
			A1 = !1,
			U9 = 0,
			X4 = 0,
			l6 = null,
			vW = 0,
			SW = 25,
			L = null,
			T5 = null,
			p6 = -1,
			G4 = !1,
			Z4 = {
				readContext: d0,
				use: JB,
				useCallback: t0,
				useContext: t0,
				useEffect: t0,
				useImperativeHandle: t0,
				useLayoutEffect: t0,
				useInsertionEffect: t0,
				useMemo: t0,
				useReducer: t0,
				useRef: t0,
				useState: t0,
				useDebugValue: t0,
				useDeferredValue: t0,
				useTransition: t0,
				useSyncExternalStore: t0,
				useId: t0,
				useHostTransitionStatus: t0,
				useFormState: t0,
				useActionState: t0,
				useOptimistic: t0,
				useMemoCache: t0,
				useCacheRefresh: t0,
			};
		Z4.useEffectEvent = t0;
		var dZ = null,
			tJ = null,
			sZ = null,
			rJ = null,
			j6 = null,
			h5 = null,
			Q9 = null;
		((dZ = {
			readContext: function (B) {
				return d0(B);
			},
			use: JB,
			useCallback: function (B, X) {
				return ((L = 'useCallback'), Z0(), l1(X), uG(B, X));
			},
			useContext: function (B) {
				return ((L = 'useContext'), Z0(), d0(B));
			},
			useEffect: function (B, X) {
				return ((L = 'useEffect'), Z0(), l1(X), Y7(B, X));
			},
			useImperativeHandle: function (B, X, G) {
				return ((L = 'useImperativeHandle'), Z0(), l1(G), fG(B, X, G));
			},
			useInsertionEffect: function (B, X) {
				((L = 'useInsertionEffect'), Z0(), l1(X), Y1(4, f2, B, X));
			},
			useLayoutEffect: function (B, X) {
				return ((L = 'useLayoutEffect'), Z0(), l1(X), yG(B, X));
			},
			useMemo: function (B, X) {
				((L = 'useMemo'), Z0(), l1(X));
				var G = A.H;
				A.H = j6;
				try {
					return hG(B, X);
				} finally {
					A.H = G;
				}
			},
			useReducer: function (B, X, G) {
				((L = 'useReducer'), Z0());
				var Z = A.H;
				A.H = j6;
				try {
					return CG(B, X, G);
				} finally {
					A.H = Z;
				}
			},
			useRef: function (B) {
				return ((L = 'useRef'), Z0(), bG(B));
			},
			useState: function (B) {
				((L = 'useState'), Z0());
				var X = A.H;
				A.H = j6;
				try {
					return SG(B);
				} finally {
					A.H = X;
				}
			},
			useDebugValue: function () {
				((L = 'useDebugValue'), Z0());
			},
			useDeferredValue: function (B, X) {
				return ((L = 'useDeferredValue'), Z0(), dG(B, X));
			},
			useTransition: function () {
				return ((L = 'useTransition'), Z0(), pG());
			},
			useSyncExternalStore: function (B, X, G) {
				return ((L = 'useSyncExternalStore'), Z0(), TG(B, X, G));
			},
			useId: function () {
				return ((L = 'useId'), Z0(), cG());
			},
			useFormState: function (B, X) {
				return ((L = 'useFormState'), Z0(), e4(), c1(B, X));
			},
			useActionState: function (B, X) {
				return ((L = 'useActionState'), Z0(), c1(B, X));
			},
			useOptimistic: function (B) {
				return ((L = 'useOptimistic'), Z0(), gG(B));
			},
			useHostTransitionStatus: $1,
			useMemoCache: Z1,
			useCacheRefresh: function () {
				return ((L = 'useCacheRefresh'), Z0(), aG());
			},
			useEffectEvent: function (B) {
				return ((L = 'useEffectEvent'), Z0(), mG(B));
			},
		}),
			(tJ = {
				readContext: function (B) {
					return d0(B);
				},
				use: JB,
				useCallback: function (B, X) {
					return ((L = 'useCallback'), x(), uG(B, X));
				},
				useContext: function (B) {
					return ((L = 'useContext'), x(), d0(B));
				},
				useEffect: function (B, X) {
					return ((L = 'useEffect'), x(), Y7(B, X));
				},
				useImperativeHandle: function (B, X, G) {
					return ((L = 'useImperativeHandle'), x(), fG(B, X, G));
				},
				useInsertionEffect: function (B, X) {
					((L = 'useInsertionEffect'), x(), Y1(4, f2, B, X));
				},
				useLayoutEffect: function (B, X) {
					return ((L = 'useLayoutEffect'), x(), yG(B, X));
				},
				useMemo: function (B, X) {
					((L = 'useMemo'), x());
					var G = A.H;
					A.H = j6;
					try {
						return hG(B, X);
					} finally {
						A.H = G;
					}
				},
				useReducer: function (B, X, G) {
					((L = 'useReducer'), x());
					var Z = A.H;
					A.H = j6;
					try {
						return CG(B, X, G);
					} finally {
						A.H = Z;
					}
				},
				useRef: function (B) {
					return ((L = 'useRef'), x(), bG(B));
				},
				useState: function (B) {
					((L = 'useState'), x());
					var X = A.H;
					A.H = j6;
					try {
						return SG(B);
					} finally {
						A.H = X;
					}
				},
				useDebugValue: function () {
					((L = 'useDebugValue'), x());
				},
				useDeferredValue: function (B, X) {
					return ((L = 'useDeferredValue'), x(), dG(B, X));
				},
				useTransition: function () {
					return ((L = 'useTransition'), x(), pG());
				},
				useSyncExternalStore: function (B, X, G) {
					return ((L = 'useSyncExternalStore'), x(), TG(B, X, G));
				},
				useId: function () {
					return ((L = 'useId'), x(), cG());
				},
				useActionState: function (B, X) {
					return ((L = 'useActionState'), x(), c1(B, X));
				},
				useFormState: function (B, X) {
					return ((L = 'useFormState'), x(), e4(), c1(B, X));
				},
				useOptimistic: function (B) {
					return ((L = 'useOptimistic'), x(), gG(B));
				},
				useHostTransitionStatus: $1,
				useMemoCache: Z1,
				useCacheRefresh: function () {
					return ((L = 'useCacheRefresh'), x(), aG());
				},
				useEffectEvent: function (B) {
					return ((L = 'useEffectEvent'), x(), mG(B));
				},
			}),
			(sZ = {
				readContext: function (B) {
					return d0(B);
				},
				use: JB,
				useCallback: function (B, X) {
					return ((L = 'useCallback'), x(), z7(B, X));
				},
				useContext: function (B) {
					return ((L = 'useContext'), x(), d0(B));
				},
				useEffect: function (B, X) {
					((L = 'useEffect'), x(), s2(2048, u2, B, X));
				},
				useImperativeHandle: function (B, X, G) {
					return ((L = 'useImperativeHandle'), x(), R7(B, X, G));
				},
				useInsertionEffect: function (B, X) {
					return ((L = 'useInsertionEffect'), x(), s2(4, f2, B, X));
				},
				useLayoutEffect: function (B, X) {
					return ((L = 'useLayoutEffect'), x(), s2(4, W5, B, X));
				},
				useMemo: function (B, X) {
					((L = 'useMemo'), x());
					var G = A.H;
					A.H = h5;
					try {
						return H7(B, X);
					} finally {
						A.H = G;
					}
				},
				useReducer: function (B, X, G) {
					((L = 'useReducer'), x());
					var Z = A.H;
					A.H = h5;
					try {
						return p1(B, X, G);
					} finally {
						A.H = Z;
					}
				},
				useRef: function () {
					return ((L = 'useRef'), x(), x0().memoizedState);
				},
				useState: function () {
					((L = 'useState'), x());
					var B = A.H;
					A.H = h5;
					try {
						return p1(k5);
					} finally {
						A.H = B;
					}
				},
				useDebugValue: function () {
					((L = 'useDebugValue'), x());
				},
				useDeferredValue: function (B, X) {
					return ((L = 'useDeferredValue'), x(), GR(B, X));
				},
				useTransition: function () {
					return ((L = 'useTransition'), x(), HR());
				},
				useSyncExternalStore: function (B, X, G) {
					return ((L = 'useSyncExternalStore'), x(), X7(B, X, G));
				},
				useId: function () {
					return ((L = 'useId'), x(), x0().memoizedState);
				},
				useFormState: function (B) {
					return ((L = 'useFormState'), x(), e4(), G7(B));
				},
				useActionState: function (B) {
					return ((L = 'useActionState'), x(), G7(B));
				},
				useOptimistic: function (B, X) {
					return ((L = 'useOptimistic'), x(), c$(B, X));
				},
				useHostTransitionStatus: $1,
				useMemoCache: Z1,
				useCacheRefresh: function () {
					return ((L = 'useCacheRefresh'), x(), x0().memoizedState);
				},
				useEffectEvent: function (B) {
					return ((L = 'useEffectEvent'), x(), $7(B));
				},
			}),
			(rJ = {
				readContext: function (B) {
					return d0(B);
				},
				use: JB,
				useCallback: function (B, X) {
					return ((L = 'useCallback'), x(), z7(B, X));
				},
				useContext: function (B) {
					return ((L = 'useContext'), x(), d0(B));
				},
				useEffect: function (B, X) {
					((L = 'useEffect'), x(), s2(2048, u2, B, X));
				},
				useImperativeHandle: function (B, X, G) {
					return ((L = 'useImperativeHandle'), x(), R7(B, X, G));
				},
				useInsertionEffect: function (B, X) {
					return ((L = 'useInsertionEffect'), x(), s2(4, f2, B, X));
				},
				useLayoutEffect: function (B, X) {
					return ((L = 'useLayoutEffect'), x(), s2(4, W5, B, X));
				},
				useMemo: function (B, X) {
					((L = 'useMemo'), x());
					var G = A.H;
					A.H = Q9;
					try {
						return H7(B, X);
					} finally {
						A.H = G;
					}
				},
				useReducer: function (B, X, G) {
					((L = 'useReducer'), x());
					var Z = A.H;
					A.H = Q9;
					try {
						return H3(B, X, G);
					} finally {
						A.H = Z;
					}
				},
				useRef: function () {
					return ((L = 'useRef'), x(), x0().memoizedState);
				},
				useState: function () {
					((L = 'useState'), x());
					var B = A.H;
					A.H = Q9;
					try {
						return H3(k5);
					} finally {
						A.H = B;
					}
				},
				useDebugValue: function () {
					((L = 'useDebugValue'), x());
				},
				useDeferredValue: function (B, X) {
					return ((L = 'useDeferredValue'), x(), ZR(B, X));
				},
				useTransition: function () {
					return ((L = 'useTransition'), x(), JR());
				},
				useSyncExternalStore: function (B, X, G) {
					return ((L = 'useSyncExternalStore'), x(), X7(B, X, G));
				},
				useId: function () {
					return ((L = 'useId'), x(), x0().memoizedState);
				},
				useFormState: function (B) {
					return ((L = 'useFormState'), x(), e4(), Z7(B));
				},
				useActionState: function (B) {
					return ((L = 'useActionState'), x(), Z7(B));
				},
				useOptimistic: function (B, X) {
					return ((L = 'useOptimistic'), x(), o$(B, X));
				},
				useHostTransitionStatus: $1,
				useMemoCache: Z1,
				useCacheRefresh: function () {
					return ((L = 'useCacheRefresh'), x(), x0().memoizedState);
				},
				useEffectEvent: function (B) {
					return ((L = 'useEffectEvent'), x(), $7(B));
				},
			}),
			(j6 = {
				readContext: function (B) {
					return (I2(), d0(B));
				},
				use: function (B) {
					return (E(), JB(B));
				},
				useCallback: function (B, X) {
					return ((L = 'useCallback'), E(), Z0(), uG(B, X));
				},
				useContext: function (B) {
					return ((L = 'useContext'), E(), Z0(), d0(B));
				},
				useEffect: function (B, X) {
					return ((L = 'useEffect'), E(), Z0(), Y7(B, X));
				},
				useImperativeHandle: function (B, X, G) {
					return ((L = 'useImperativeHandle'), E(), Z0(), fG(B, X, G));
				},
				useInsertionEffect: function (B, X) {
					((L = 'useInsertionEffect'), E(), Z0(), Y1(4, f2, B, X));
				},
				useLayoutEffect: function (B, X) {
					return ((L = 'useLayoutEffect'), E(), Z0(), yG(B, X));
				},
				useMemo: function (B, X) {
					((L = 'useMemo'), E(), Z0());
					var G = A.H;
					A.H = j6;
					try {
						return hG(B, X);
					} finally {
						A.H = G;
					}
				},
				useReducer: function (B, X, G) {
					((L = 'useReducer'), E(), Z0());
					var Z = A.H;
					A.H = j6;
					try {
						return CG(B, X, G);
					} finally {
						A.H = Z;
					}
				},
				useRef: function (B) {
					return ((L = 'useRef'), E(), Z0(), bG(B));
				},
				useState: function (B) {
					((L = 'useState'), E(), Z0());
					var X = A.H;
					A.H = j6;
					try {
						return SG(B);
					} finally {
						A.H = X;
					}
				},
				useDebugValue: function () {
					((L = 'useDebugValue'), E(), Z0());
				},
				useDeferredValue: function (B, X) {
					return ((L = 'useDeferredValue'), E(), Z0(), dG(B, X));
				},
				useTransition: function () {
					return ((L = 'useTransition'), E(), Z0(), pG());
				},
				useSyncExternalStore: function (B, X, G) {
					return ((L = 'useSyncExternalStore'), E(), Z0(), TG(B, X, G));
				},
				useId: function () {
					return ((L = 'useId'), E(), Z0(), cG());
				},
				useFormState: function (B, X) {
					return ((L = 'useFormState'), E(), Z0(), c1(B, X));
				},
				useActionState: function (B, X) {
					return ((L = 'useActionState'), E(), Z0(), c1(B, X));
				},
				useOptimistic: function (B) {
					return ((L = 'useOptimistic'), E(), Z0(), gG(B));
				},
				useMemoCache: function (B) {
					return (E(), Z1(B));
				},
				useHostTransitionStatus: $1,
				useCacheRefresh: function () {
					return ((L = 'useCacheRefresh'), Z0(), aG());
				},
				useEffectEvent: function (B) {
					return ((L = 'useEffectEvent'), E(), Z0(), mG(B));
				},
			}),
			(h5 = {
				readContext: function (B) {
					return (I2(), d0(B));
				},
				use: function (B) {
					return (E(), JB(B));
				},
				useCallback: function (B, X) {
					return ((L = 'useCallback'), E(), x(), z7(B, X));
				},
				useContext: function (B) {
					return ((L = 'useContext'), E(), x(), d0(B));
				},
				useEffect: function (B, X) {
					((L = 'useEffect'), E(), x(), s2(2048, u2, B, X));
				},
				useImperativeHandle: function (B, X, G) {
					return ((L = 'useImperativeHandle'), E(), x(), R7(B, X, G));
				},
				useInsertionEffect: function (B, X) {
					return ((L = 'useInsertionEffect'), E(), x(), s2(4, f2, B, X));
				},
				useLayoutEffect: function (B, X) {
					return ((L = 'useLayoutEffect'), E(), x(), s2(4, W5, B, X));
				},
				useMemo: function (B, X) {
					((L = 'useMemo'), E(), x());
					var G = A.H;
					A.H = h5;
					try {
						return H7(B, X);
					} finally {
						A.H = G;
					}
				},
				useReducer: function (B, X, G) {
					((L = 'useReducer'), E(), x());
					var Z = A.H;
					A.H = h5;
					try {
						return p1(B, X, G);
					} finally {
						A.H = Z;
					}
				},
				useRef: function () {
					return ((L = 'useRef'), E(), x(), x0().memoizedState);
				},
				useState: function () {
					((L = 'useState'), E(), x());
					var B = A.H;
					A.H = h5;
					try {
						return p1(k5);
					} finally {
						A.H = B;
					}
				},
				useDebugValue: function () {
					((L = 'useDebugValue'), E(), x());
				},
				useDeferredValue: function (B, X) {
					return ((L = 'useDeferredValue'), E(), x(), GR(B, X));
				},
				useTransition: function () {
					return ((L = 'useTransition'), E(), x(), HR());
				},
				useSyncExternalStore: function (B, X, G) {
					return ((L = 'useSyncExternalStore'), E(), x(), X7(B, X, G));
				},
				useId: function () {
					return ((L = 'useId'), E(), x(), x0().memoizedState);
				},
				useFormState: function (B) {
					return ((L = 'useFormState'), E(), x(), G7(B));
				},
				useActionState: function (B) {
					return ((L = 'useActionState'), E(), x(), G7(B));
				},
				useOptimistic: function (B, X) {
					return ((L = 'useOptimistic'), E(), x(), c$(B, X));
				},
				useMemoCache: function (B) {
					return (E(), Z1(B));
				},
				useHostTransitionStatus: $1,
				useCacheRefresh: function () {
					return ((L = 'useCacheRefresh'), x(), x0().memoizedState);
				},
				useEffectEvent: function (B) {
					return ((L = 'useEffectEvent'), E(), x(), $7(B));
				},
			}),
			(Q9 = {
				readContext: function (B) {
					return (I2(), d0(B));
				},
				use: function (B) {
					return (E(), JB(B));
				},
				useCallback: function (B, X) {
					return ((L = 'useCallback'), E(), x(), z7(B, X));
				},
				useContext: function (B) {
					return ((L = 'useContext'), E(), x(), d0(B));
				},
				useEffect: function (B, X) {
					((L = 'useEffect'), E(), x(), s2(2048, u2, B, X));
				},
				useImperativeHandle: function (B, X, G) {
					return ((L = 'useImperativeHandle'), E(), x(), R7(B, X, G));
				},
				useInsertionEffect: function (B, X) {
					return ((L = 'useInsertionEffect'), E(), x(), s2(4, f2, B, X));
				},
				useLayoutEffect: function (B, X) {
					return ((L = 'useLayoutEffect'), E(), x(), s2(4, W5, B, X));
				},
				useMemo: function (B, X) {
					((L = 'useMemo'), E(), x());
					var G = A.H;
					A.H = h5;
					try {
						return H7(B, X);
					} finally {
						A.H = G;
					}
				},
				useReducer: function (B, X, G) {
					((L = 'useReducer'), E(), x());
					var Z = A.H;
					A.H = h5;
					try {
						return H3(B, X, G);
					} finally {
						A.H = Z;
					}
				},
				useRef: function () {
					return ((L = 'useRef'), E(), x(), x0().memoizedState);
				},
				useState: function () {
					((L = 'useState'), E(), x());
					var B = A.H;
					A.H = h5;
					try {
						return H3(k5);
					} finally {
						A.H = B;
					}
				},
				useDebugValue: function () {
					((L = 'useDebugValue'), E(), x());
				},
				useDeferredValue: function (B, X) {
					return ((L = 'useDeferredValue'), E(), x(), ZR(B, X));
				},
				useTransition: function () {
					return ((L = 'useTransition'), E(), x(), JR());
				},
				useSyncExternalStore: function (B, X, G) {
					return ((L = 'useSyncExternalStore'), E(), x(), X7(B, X, G));
				},
				useId: function () {
					return ((L = 'useId'), E(), x(), x0().memoizedState);
				},
				useFormState: function (B) {
					return ((L = 'useFormState'), E(), x(), Z7(B));
				},
				useActionState: function (B) {
					return ((L = 'useActionState'), E(), x(), Z7(B));
				},
				useOptimistic: function (B, X) {
					return ((L = 'useOptimistic'), E(), x(), o$(B, X));
				},
				useMemoCache: function (B) {
					return (E(), Z1(B));
				},
				useHostTransitionStatus: $1,
				useCacheRefresh: function () {
					return ((L = 'useCacheRefresh'), x(), x0().memoizedState);
				},
				useEffectEvent: function (B) {
					return ((L = 'useEffectEvent'), E(), x(), $7(B));
				},
			}));
		var eJ = {},
			BU = new Set(),
			XU = new Set(),
			GU = new Set(),
			ZU = new Set(),
			YU = new Set(),
			$U = new Set(),
			RU = new Set(),
			zU = new Set(),
			HU = new Set(),
			JU = new Set();
		Object.freeze(eJ);
		var lZ = {
				enqueueSetState: function (B, X, G) {
					B = B._reactInternals;
					var Z = z5(B),
						Y = $B(Z);
					((Y.payload = X),
						G !== void 0 && G !== null && (nG(G), (Y.callback = G)),
						(X = RB(B, Y, Z)),
						X !== null && (r5(Z, 'this.setState()', B), n0(X, B, Z), Y3(X, B, Z)));
				},
				enqueueReplaceState: function (B, X, G) {
					B = B._reactInternals;
					var Z = z5(B),
						Y = $B(Z);
					((Y.tag = pJ),
						(Y.payload = X),
						G !== void 0 && G !== null && (nG(G), (Y.callback = G)),
						(X = RB(B, Y, Z)),
						X !== null && (r5(Z, 'this.replaceState()', B), n0(X, B, Z), Y3(X, B, Z)));
				},
				enqueueForceUpdate: function (B, X) {
					B = B._reactInternals;
					var G = z5(B),
						Z = $B(G);
					((Z.tag = cJ),
						X !== void 0 && X !== null && (nG(X), (Z.callback = X)),
						(X = RB(B, Z, G)),
						X !== null && (r5(G, 'this.forceUpdate()', B), n0(X, B, G), Y3(X, B, G)));
				},
			},
			CX = null,
			pZ = null,
			cZ = Error(
				"This is not a real error. It's an implementation detail of React's selective hydration feature. If this leaks into userspace, it's a bug in React. Please file an issue.",
			),
			R2 = !1,
			UU = {},
			QU = {},
			MU = {},
			qU = {},
			DX = !1,
			WU = {},
			M9 = {},
			aZ = { dehydrated: null, treeContext: null, retryLane: 0, hydrationErrors: null },
			wU = !1,
			KU = null;
		KU = new Set();
		var c6 = !1,
			z2 = !1,
			oZ = !1,
			OU = typeof WeakSet === 'function' ? WeakSet : Set,
			_2 = null,
			TX = null,
			vX = null,
			H2 = null,
			c2 = !1,
			d5 = null,
			M2 = !1,
			Y4 = 8192,
			gW = {
				getCacheForType: function (B) {
					var X = d0(Z2),
						G = X.data.get(B);
					return (G === void 0 && ((G = B()), X.data.set(B, G)), G);
				},
				cacheSignal: function () {
					return d0(Z2).controller.signal;
				},
				getOwner: function () {
					return U5;
				},
			};
		if (typeof Symbol === 'function' && Symbol.for) {
			var $4 = Symbol.for;
			($4('selector.component'),
				$4('selector.has_pseudo_class'),
				$4('selector.role'),
				$4('selector.test_id'),
				$4('selector.text'));
		}
		var kW = [],
			bW = typeof WeakMap === 'function' ? WeakMap : Map,
			L2 = 0,
			q2 = 2,
			w5 = 4,
			a6 = 0,
			R4 = 1,
			j1 = 2,
			q9 = 3,
			VB = 4,
			W9 = 6,
			_U = 5,
			M0 = L2,
			S0 = null,
			G0 = null,
			X0 = 0,
			a2 = 0,
			w9 = 1,
			F1 = 2,
			z4 = 3,
			LU = 4,
			nZ = 5,
			H4 = 6,
			K9 = 7,
			iZ = 8,
			P1 = 9,
			N0 = a2,
			K5 = null,
			CB = !1,
			SX = !1,
			tZ = !1,
			F6 = 0,
			a0 = a6,
			DB = 0,
			TB = 0,
			rZ = 0,
			o2 = 0,
			x1 = 0,
			J4 = null,
			h2 = null,
			O9 = !1,
			_9 = 0,
			AU = 0,
			jU = 300,
			L9 = 1 / 0,
			FU = 500,
			U4 = null,
			r0 = null,
			vB = null,
			A9 = 0,
			eZ = 1,
			BY = 2,
			PU = 3,
			SB = 0,
			xU = 1,
			NU = 2,
			EU = 3,
			IU = 4,
			j9 = 5,
			J2 = 0,
			gB = null,
			gX = null,
			s5 = 0,
			XY = 0,
			GY = -0,
			ZY = null,
			VU = null,
			CU = null,
			l5 = A9,
			DU = null,
			mW = 50,
			Q4 = 0,
			YY = null,
			$Y = !1,
			F9 = !1,
			yW = 50,
			N1 = 0,
			M4 = null,
			kX = !1,
			P9 = null,
			TU = !1,
			vU = new Set(),
			fW = {},
			x9 = null,
			bX = null,
			RY = !1,
			zY = !1,
			N9 = !1,
			HY = !1,
			kB = 0,
			JY = {};
		((function () {
			for (var B = 0; B < AZ.length; B++) {
				var X = AZ[B],
					G = X.toLowerCase();
				((X = X[0].toUpperCase() + X.slice(1)), g5(G, 'on' + X));
			}
			(g5(HJ, 'onAnimationEnd'),
				g5(JJ, 'onAnimationIteration'),
				g5(UJ, 'onAnimationStart'),
				g5('dblclick', 'onDoubleClick'),
				g5('focusin', 'onFocus'),
				g5('focusout', 'onBlur'),
				g5(wW, 'onTransitionRun'),
				g5(KW, 'onTransitionStart'),
				g5(OW, 'onTransitionCancel'),
				g5(QJ, 'onTransitionEnd'));
		})(),
			B5('onMouseEnter', ['mouseout', 'mouseover']),
			B5('onMouseLeave', ['mouseout', 'mouseover']),
			B5('onPointerEnter', ['pointerout', 'pointerover']),
			B5('onPointerLeave', ['pointerout', 'pointerover']),
			V2(
				'onChange',
				'change click focusin focusout input keydown keyup selectionchange'.split(' '),
			),
			V2(
				'onSelect',
				'focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange'.split(
					' ',
				),
			),
			V2('onBeforeInput', ['compositionend', 'keypress', 'textInput', 'paste']),
			V2('onCompositionEnd', 'compositionend focusout keydown keypress keyup mousedown'.split(' ')),
			V2(
				'onCompositionStart',
				'compositionstart focusout keydown keypress keyup mousedown'.split(' '),
			),
			V2(
				'onCompositionUpdate',
				'compositionupdate focusout keydown keypress keyup mousedown'.split(' '),
			));
		var q4 =
				'abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting'.split(
					' ',
				),
			UY = new Set(
				'beforetoggle cancel close invalid load scroll scrollend toggle'.split(' ').concat(q4),
			),
			E9 = '_reactListening' + Math.random().toString(36).slice(2),
			SU = !1,
			gU = !1,
			I9 = !1,
			kU = !1,
			V9 = !1,
			C9 = !1,
			bU = !1,
			D9 = {},
			uW = /\r\n?/g,
			hW = /\u0000|\uFFFD/g,
			E1 = 'http://www.w3.org/1999/xlink',
			QY = 'http://www.w3.org/XML/1998/namespace',
			dW = "javascript:throw new Error('React form unexpectedly submitted.')",
			sW = 'suppressHydrationWarning',
			I1 = '&',
			T9 = '/&',
			W4 = '$',
			w4 = '/$',
			bB = '$?',
			V1 = '$~',
			mX = '$!',
			lW = 'html',
			pW = 'body',
			cW = 'head',
			MY = 'F!',
			mU = 'F',
			yU = 'loading',
			aW = 'style',
			o6 = 0,
			yX = 1,
			v9 = 2,
			qY = null,
			WY = null,
			fU = { dialog: !0, webview: !0 },
			wY = null,
			K4 = void 0,
			uU = typeof setTimeout === 'function' ? setTimeout : void 0,
			oW = typeof clearTimeout === 'function' ? clearTimeout : void 0,
			C1 = -1,
			hU = typeof Promise === 'function' ? Promise : void 0,
			nW =
				typeof queueMicrotask === 'function'
					? queueMicrotask
					: typeof hU < 'u'
						? function (B) {
								return hU.resolve(null).then(B).catch(SM);
							}
						: uU,
			KY = null,
			D1 = 0,
			O4 = 1,
			dU = 2,
			sU = 3,
			v5 = 4,
			S5 = new Map(),
			lU = new Set(),
			n6 = L0.d;
		L0.d = {
			f: function () {
				var B = n6.f(),
					X = t1();
				return B || X;
			},
			r: function (B) {
				var X = n(B);
				X !== null && X.tag === 5 && X.type === 'form' ? zR(X) : n6.r(B);
			},
			D: function (B) {
				(n6.D(B), BH('dns-prefetch', B, null));
			},
			C: function (B, X) {
				(n6.C(B, X), BH('preconnect', B, X));
			},
			L: function (B, X, G) {
				n6.L(B, X, G);
				var Z = fX;
				if (Z && B && X) {
					var Y = 'link[rel="preload"][as="' + A5(X) + '"]';
					X === 'image'
						? G && G.imageSrcSet
							? ((Y += '[imagesrcset="' + A5(G.imageSrcSet) + '"]'),
								typeof G.imageSizes === 'string' &&
									(Y += '[imagesizes="' + A5(G.imageSizes) + '"]'))
							: (Y += '[href="' + A5(B) + '"]')
						: (Y += '[href="' + A5(B) + '"]');
					var $ = Y;
					switch (X) {
						case 'style':
							$ = BX(B);
							break;
						case 'script':
							$ = XX(B);
					}
					S5.has($) ||
						((B = Y0(
							{ rel: 'preload', href: X === 'image' && G && G.imageSrcSet ? void 0 : B, as: X },
							G,
						)),
						S5.set($, B),
						Z.querySelector(Y) !== null ||
							(X === 'style' && Z.querySelector(P3($))) ||
							(X === 'script' && Z.querySelector(x3($))) ||
							((X = Z.createElement('link')), x2(X, 'link', B), f(X), Z.head.appendChild(X)));
				}
			},
			m: function (B, X) {
				n6.m(B, X);
				var G = fX;
				if (G && B) {
					var Z = X && typeof X.as === 'string' ? X.as : 'script',
						Y = 'link[rel="modulepreload"][as="' + A5(Z) + '"][href="' + A5(B) + '"]',
						$ = Y;
					switch (Z) {
						case 'audioworklet':
						case 'paintworklet':
						case 'serviceworker':
						case 'sharedworker':
						case 'worker':
						case 'script':
							$ = XX(B);
					}
					if (
						!S5.has($) &&
						((B = Y0({ rel: 'modulepreload', href: B }, X)),
						S5.set($, B),
						G.querySelector(Y) === null)
					) {
						switch (Z) {
							case 'audioworklet':
							case 'paintworklet':
							case 'serviceworker':
							case 'sharedworker':
							case 'worker':
							case 'script':
								if (G.querySelector(x3($))) return;
						}
						((Z = G.createElement('link')), x2(Z, 'link', B), f(Z), G.head.appendChild(Z));
					}
				}
			},
			X: function (B, X) {
				n6.X(B, X);
				var G = fX;
				if (G && B) {
					var Z = W0(G).hoistableScripts,
						Y = XX(B),
						$ = Z.get(Y);
					$ ||
						(($ = G.querySelector(x3(Y))),
						$ ||
							((B = Y0({ src: B, async: !0 }, X)),
							(X = S5.get(Y)) && f8(B, X),
							($ = G.createElement('script')),
							f($),
							x2($, 'link', B),
							G.head.appendChild($)),
						($ = { type: 'script', instance: $, count: 1, state: null }),
						Z.set(Y, $));
				}
			},
			S: function (B, X, G) {
				n6.S(B, X, G);
				var Z = fX;
				if (Z && B) {
					var Y = W0(Z).hoistableStyles,
						$ = BX(B);
					X = X || 'default';
					var R = Y.get($);
					if (!R) {
						var z = { loading: D1, preload: null };
						if ((R = Z.querySelector(P3($)))) z.loading = O4 | v5;
						else {
							((B = Y0({ rel: 'stylesheet', href: B, 'data-precedence': X }, G)),
								(G = S5.get($)) && y8(B, G));
							var H = (R = Z.createElement('link'));
							(f(H),
								x2(H, 'link', B),
								(H._p = new Promise(function (J, w) {
									((H.onload = J), (H.onerror = w));
								})),
								H.addEventListener('load', function () {
									z.loading |= O4;
								}),
								H.addEventListener('error', function () {
									z.loading |= dU;
								}),
								(z.loading |= v5),
								I7(R, X, Z));
						}
						((R = { type: 'stylesheet', instance: R, count: 1, state: z }), Y.set($, R));
					}
				}
			},
			M: function (B, X) {
				n6.M(B, X);
				var G = fX;
				if (G && B) {
					var Z = W0(G).hoistableScripts,
						Y = XX(B),
						$ = Z.get(Y);
					$ ||
						(($ = G.querySelector(x3(Y))),
						$ ||
							((B = Y0({ src: B, async: !0, type: 'module' }, X)),
							(X = S5.get(Y)) && f8(B, X),
							($ = G.createElement('script')),
							f($),
							x2($, 'link', B),
							G.head.appendChild($)),
						($ = { type: 'script', instance: $, count: 1, state: null }),
						Z.set(Y, $));
				}
			},
		};
		var fX = typeof document > 'u' ? null : document,
			S9 = null,
			iW = 60000,
			tW = 800,
			rW = 500,
			OY = 0,
			_Y = null,
			g9 = null,
			T1 = qq,
			_4 = {
				$$typeof: M6,
				Provider: null,
				Consumer: null,
				_currentValue: T1,
				_currentValue2: T1,
				_threadCount: 0,
			},
			pU = '%c%s%c',
			cU =
				'background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px',
			aU = '',
			k9 = ' ',
			eW = Function.prototype.bind,
			oU = !1,
			nU = null,
			iU = null,
			tU = null,
			rU = null,
			eU = null,
			BQ = null,
			XQ = null,
			GQ = null,
			ZQ = null,
			YQ = null;
		((nU = function (B, X, G, Z) {
			((X = h(B, X)),
				X !== null &&
					((G = q0(X.memoizedState, G, 0, Z)),
					(X.memoizedState = G),
					(X.baseState = G),
					(B.memoizedProps = Y0({}, B.memoizedProps)),
					(G = C2(B, 2)),
					G !== null && n0(G, B, 2)));
		}),
			(iU = function (B, X, G) {
				((X = h(B, X)),
					X !== null &&
						((G = E0(X.memoizedState, G, 0)),
						(X.memoizedState = G),
						(X.baseState = G),
						(B.memoizedProps = Y0({}, B.memoizedProps)),
						(G = C2(B, 2)),
						G !== null && n0(G, B, 2)));
			}),
			(tU = function (B, X, G, Z) {
				((X = h(B, X)),
					X !== null &&
						((G = O0(X.memoizedState, G, Z)),
						(X.memoizedState = G),
						(X.baseState = G),
						(B.memoizedProps = Y0({}, B.memoizedProps)),
						(G = C2(B, 2)),
						G !== null && n0(G, B, 2)));
			}),
			(rU = function (B, X, G) {
				((B.pendingProps = q0(B.memoizedProps, X, 0, G)),
					B.alternate && (B.alternate.pendingProps = B.pendingProps),
					(X = C2(B, 2)),
					X !== null && n0(X, B, 2));
			}),
			(eU = function (B, X) {
				((B.pendingProps = E0(B.memoizedProps, X, 0)),
					B.alternate && (B.alternate.pendingProps = B.pendingProps),
					(X = C2(B, 2)),
					X !== null && n0(X, B, 2));
			}),
			(BQ = function (B, X, G) {
				((B.pendingProps = O0(B.memoizedProps, X, G)),
					B.alternate && (B.alternate.pendingProps = B.pendingProps),
					(X = C2(B, 2)),
					X !== null && n0(X, B, 2));
			}),
			(XQ = function (B) {
				var X = C2(B, 2);
				X !== null && n0(X, B, 2);
			}),
			(GQ = function (B) {
				var X = m1(),
					G = C2(B, X);
				G !== null && n0(G, B, X);
			}),
			(ZQ = function (B) {
				X2 = B;
			}),
			(YQ = function (B) {
				h0 = B;
			}));
		var b9 = !0,
			m9 = null,
			LY = !1,
			mB = null,
			yB = null,
			fB = null,
			L4 = new Map(),
			A4 = new Map(),
			uB = [],
			Bw =
				'mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset'.split(
					' ',
				),
			y9 = null;
		if (
			((v7.prototype.render = p8.prototype.render =
				function (B) {
					var X = this._internalRoot;
					if (X === null) throw Error('Cannot update an unmounted root.');
					var G = arguments;
					(typeof G[1] === 'function'
						? console.error(
								'does not support the second callback argument. To execute a side effect after rendering, declare it in a component body with useEffect().',
							)
						: m0(G[1])
							? console.error(
									"You passed a container to the second argument of root.render(...). You don't need to pass it again since you already passed it to create the root.",
								)
							: typeof G[1] < 'u' &&
								console.error(
									'You passed a second argument to root.render(...) but it only accepts one argument.',
								),
						(G = B));
					var Z = X.current,
						Y = z5(Z);
					u8(Z, Y, G, X, null, null);
				}),
			(v7.prototype.unmount = p8.prototype.unmount =
				function () {
					var B = arguments;
					if (
						(typeof B[0] === 'function' &&
							console.error(
								'does not support a callback argument. To execute a side effect after rendering, declare it in a component body with useEffect().',
							),
						(B = this._internalRoot),
						B !== null)
					) {
						this._internalRoot = null;
						var X = B.containerInfo;
						((M0 & (q2 | w5)) !== L2 &&
							console.error(
								'Attempted to synchronously unmount a root while React was already rendering. React cannot finish unmounting the root until the current render has completed, which may lead to a race condition.',
							),
							u8(B.current, 2, null, B, null, null),
							t1(),
							(X[KB] = null));
					}
				}),
			(v7.prototype.unstable_scheduleHydration = function (B) {
				if (B) {
					var X = O();
					B = { blockedOn: null, target: B, priority: X };
					for (var G = 0; G < uB.length && X !== 0 && X < uB[G].priority; G++);
					(uB.splice(G, 0, B), G === 0 && WH(B));
				}
			}),
			(function () {
				var B = hX.version;
				if (B !== '19.2.8')
					throw Error(
						`Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got:
  - react:      ` +
							(B +
								`
  - react-dom:  19.2.8
Learn more: https://react.dev/warnings/version-mismatch`),
					);
			})(),
			(typeof Map === 'function' &&
				Map.prototype != null &&
				typeof Map.prototype.forEach === 'function' &&
				typeof Set === 'function' &&
				Set.prototype != null &&
				typeof Set.prototype.clear === 'function' &&
				typeof Set.prototype.forEach === 'function') ||
				console.error(
					'React depends on Map and Set built-in types. Make sure that you load a polyfill in older browsers. https://react.dev/link/react-polyfills',
				),
			(L0.findDOMNode = function (B) {
				var X = B._reactInternals;
				if (X === void 0) {
					if (typeof B.render === 'function')
						throw Error('Unable to find node on an unmounted component.');
					throw (
						(B = Object.keys(B).join(',')),
						Error('Argument appears to not be a ReactComponent. Keys: ' + B)
					);
				}
				return (
					(B = c5(X)),
					(B = B !== null ? P6(B) : null),
					(B = B === null ? null : B.stateNode),
					B
				);
			}),
			!(function () {
				var B = {
					bundleType: 1,
					version: '19.2.8',
					rendererPackageName: 'react-dom',
					currentDispatcherRef: A,
					reconcilerVersion: '19.2.8',
				};
				return (
					(B.overrideHookState = nU),
					(B.overrideHookStateDeletePath = iU),
					(B.overrideHookStateRenamePath = tU),
					(B.overrideProps = rU),
					(B.overridePropsDeletePath = eU),
					(B.overridePropsRenamePath = BQ),
					(B.scheduleUpdate = XQ),
					(B.scheduleRetry = GQ),
					(B.setErrorHandler = ZQ),
					(B.setSuspenseHandler = YQ),
					(B.scheduleRefresh = i2),
					(B.scheduleRoot = D0),
					(B.setRefreshHandler = p0),
					(B.getCurrentFiber = $q),
					b1(B)
				);
			})() &&
				O6 &&
				window.top === window.self &&
				((-1 < navigator.userAgent.indexOf('Chrome') &&
					navigator.userAgent.indexOf('Edge') === -1) ||
					-1 < navigator.userAgent.indexOf('Firefox')))
		) {
			var $Q = window.location.protocol;
			/^(https?|file):$/.test($Q) &&
				console.info(
					'%cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools' +
						($Q === 'file:'
							? `
You might need to use a local HTTP server (instead of file://): https://react.dev/link/react-devtools-faq`
							: ''),
					'font-weight:bold',
				);
		}
		((qw.createRoot = function (B, X) {
			if (!m0(B)) throw Error('Target container is not a DOM element.');
			_H(B);
			var G = !1,
				Z = '',
				Y = wR,
				$ = KR,
				R = OR;
			return (
				X !== null &&
					X !== void 0 &&
					(X.hydrate
						? console.warn(
								'hydrate through createRoot is deprecated. Use ReactDOMClient.hydrateRoot(container, <App />) instead.',
							)
						: typeof X === 'object' &&
							X !== null &&
							X.$$typeof === Q6 &&
							console.error(`You passed a JSX element to createRoot. You probably meant to call root.render instead. Example usage:

  let root = createRoot(domContainer);
  root.render(<App />);`),
					X.unstable_strictMode === !0 && (G = !0),
					X.identifierPrefix !== void 0 && (Z = X.identifierPrefix),
					X.onUncaughtError !== void 0 && (Y = X.onUncaughtError),
					X.onCaughtError !== void 0 && ($ = X.onCaughtError),
					X.onRecoverableError !== void 0 && (R = X.onRecoverableError)),
				(X = zH(B, 1, !1, null, null, G, Z, null, Y, $, R, OH)),
				(B[KB] = X.current),
				E8(B),
				new p8(X)
			);
		}),
			(qw.hydrateRoot = function (B, X, G) {
				if (!m0(B)) throw Error('Target container is not a DOM element.');
				(_H(B),
					X === void 0 &&
						console.error(
							'Must provide initial children as second argument to hydrateRoot. Example usage: hydrateRoot(domContainer, <App />)',
						));
				var Z = !1,
					Y = '',
					$ = wR,
					R = KR,
					z = OR,
					H = null;
				return (
					G !== null &&
						G !== void 0 &&
						(G.unstable_strictMode === !0 && (Z = !0),
						G.identifierPrefix !== void 0 && (Y = G.identifierPrefix),
						G.onUncaughtError !== void 0 && ($ = G.onUncaughtError),
						G.onCaughtError !== void 0 && (R = G.onCaughtError),
						G.onRecoverableError !== void 0 && (z = G.onRecoverableError),
						G.formState !== void 0 && (H = G.formState)),
					(X = zH(B, 1, !0, X, G != null ? G : null, Z, Y, H, $, R, z, OH)),
					(X.context = HH(null)),
					(G = X.current),
					(Z = z5(G)),
					(Z = aB(Z)),
					(Y = $B(Z)),
					(Y.callback = null),
					RB(G, Y, Z),
					r5(Z, 'hydrateRoot()', null),
					(G = Z),
					(X.current.lanes = G),
					r6(X, G),
					J6(X),
					(B[KB] = X.current),
					E8(B),
					new v7(X)
				);
			}),
			(qw.version = '19.2.8'),
			typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === 'function' &&
				__REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error()));
	})();
});
var qQ = v1((oK, MQ) => {
	var Ww = n2(QQ());
	MQ.exports = Ww;
});
var j4 = v1((ww) => {
	var g1 = n2(uX());
	(function () {
		function h(P) {
			if (P == null) return null;
			if (typeof P === 'function') return P.$$typeof === v ? null : P.displayName || P.name || null;
			if (typeof P === 'string') return P;
			switch (P) {
				case p0:
					return 'Fragment';
				case t2:
					return 'Profiler';
				case m0:
					return 'StrictMode';
				case c5:
					return 'Suspense';
				case P6:
					return 'SuspenseList';
				case O5:
					return 'Activity';
			}
			if (typeof P === 'object')
				switch (
					(typeof P.tag === 'number' &&
						console.error(
							'Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.',
						),
					P.$$typeof)
				) {
					case i2:
						return 'Portal';
					case A2:
						return P.displayName || 'Context';
					case r2:
						return (P._context.displayName || 'Context') + '.Consumer';
					case p5:
						var o = P.render;
						return (
							(P = P.displayName),
							P ||
								((P = o.displayName || o.name || ''),
								(P = P !== '' ? 'ForwardRef(' + P + ')' : 'ForwardRef')),
							P
						);
					case U2:
						return ((o = P.displayName || null), o !== null ? o : h(P.type) || 'Memo');
					case J0:
						((o = P._payload), (P = P._init));
						try {
							return h(P(o));
						} catch (F0) {}
				}
			return null;
		}
		function q0(P) {
			return '' + P;
		}
		function O0(P) {
			try {
				q0(P);
				var o = !1;
			} catch (I0) {
				o = !0;
			}
			if (o) {
				o = console;
				var F0 = o.error,
					P0 =
						(typeof Symbol === 'function' && Symbol.toStringTag && P[Symbol.toStringTag]) ||
						P.constructor.name ||
						'Object';
				return (
					F0.call(
						o,
						'The provided key is an unsupported type %s. This value must be coerced to a string before using it here.',
						P0,
					),
					q0(P)
				);
			}
		}
		function C0(P) {
			if (P === p0) return '<>';
			if (typeof P === 'object' && P !== null && P.$$typeof === J0) return '<...>';
			try {
				var o = h(P);
				return o ? '<' + o + '>' : '<...>';
			} catch (F0) {
				return '<...>';
			}
		}
		function E0() {
			var P = G2.A;
			return P === null ? null : P.getOwner();
		}
		function h0() {
			return Error('react-stack-top-frame');
		}
		function X2(P) {
			if (K0.call(P, 'key')) {
				var o = Object.getOwnPropertyDescriptor(P, 'key').get;
				if (o && o.isReactWarning) return !1;
			}
			return P.key !== void 0;
		}
		function E(P, o) {
			function F0() {
				T ||
					((T = !0),
					console.error(
						'%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)',
						o,
					));
			}
			((F0.isReactWarning = !0), Object.defineProperty(P, 'key', { get: F0, configurable: !0 }));
		}
		function I2() {
			var P = h(this.type);
			return (
				l[P] ||
					((l[P] = !0),
					console.error(
						'Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.',
					)),
				(P = this.props.ref),
				P !== void 0 ? P : null
			);
		}
		function v2(P, o, F0, P0, I0, a5) {
			var o0 = F0.ref;
			return (
				(P = { $$typeof: D0, type: P, key: o, props: F0, _owner: P0 }),
				(o0 !== void 0 ? o0 : null) !== null
					? Object.defineProperty(P, 'ref', { enumerable: !1, get: I2 })
					: Object.defineProperty(P, 'ref', { enumerable: !1, value: null }),
				(P._store = {}),
				Object.defineProperty(P._store, 'validated', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: 0,
				}),
				Object.defineProperty(P, '_debugInfo', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: null,
				}),
				Object.defineProperty(P, '_debugStack', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: I0,
				}),
				Object.defineProperty(P, '_debugTask', {
					configurable: !1,
					enumerable: !1,
					writable: !0,
					value: a5,
				}),
				Object.freeze && (Object.freeze(P.props), Object.freeze(P)),
				P
			);
		}
		function I(P, o, F0, P0, I0, a5) {
			var o0 = o.children;
			if (o0 !== void 0)
				if (P0)
					if (z0(o0)) {
						for (P0 = 0; P0 < o0.length; P0++) j(o0[P0]);
						Object.freeze && Object.freeze(o0);
					} else
						console.error(
							'React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.',
						);
				else j(o0);
			if (K0.call(o, 'key')) {
				o0 = h(P);
				var e2 = Object.keys(o).filter(function (x6) {
					return x6 !== 'key';
				});
				((P0 =
					0 < e2.length ? '{key: someKey, ' + e2.join(': ..., ') + ': ...}' : '{key: someKey}'),
					j0[o0 + P0] ||
						((e2 = 0 < e2.length ? '{' + e2.join(': ..., ') + ': ...}' : '{}'),
						console.error(
							`A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`,
							P0,
							o0,
							e2,
							o0,
						),
						(j0[o0 + P0] = !0)));
			}
			if (
				((o0 = null),
				F0 !== void 0 && (O0(F0), (o0 = '' + F0)),
				X2(o) && (O0(o.key), (o0 = '' + o.key)),
				'key' in o)
			) {
				F0 = {};
				for (var _5 in o) _5 !== 'key' && (F0[_5] = o[_5]);
			} else F0 = o;
			return (
				o0 && E(F0, typeof P === 'function' ? P.displayName || P.name || 'Unknown' : P),
				v2(P, o0, F0, E0(), I0, a5)
			);
		}
		function j(P) {
			g(P)
				? P._store && (P._store.validated = 1)
				: typeof P === 'object' &&
					P !== null &&
					P.$$typeof === J0 &&
					(P._payload.status === 'fulfilled'
						? g(P._payload.value) &&
							P._payload.value._store &&
							(P._payload.value._store.validated = 1)
						: P._store && (P._store.validated = 1));
		}
		function g(P) {
			return typeof P === 'object' && P !== null && P.$$typeof === D0;
		}
		var D0 = Symbol.for('react.transitional.element'),
			i2 = Symbol.for('react.portal'),
			p0 = Symbol.for('react.fragment'),
			m0 = Symbol.for('react.strict_mode'),
			t2 = Symbol.for('react.profiler'),
			r2 = Symbol.for('react.consumer'),
			A2 = Symbol.for('react.context'),
			p5 = Symbol.for('react.forward_ref'),
			c5 = Symbol.for('react.suspense'),
			P6 = Symbol.for('react.suspense_list'),
			U2 = Symbol.for('react.memo'),
			J0 = Symbol.for('react.lazy'),
			O5 = Symbol.for('react.activity'),
			v = Symbol.for('react.client.reference'),
			G2 = g1.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
			K0 = Object.prototype.hasOwnProperty,
			z0 = Array.isArray,
			j2 = console.createTask
				? console.createTask
				: function () {
						return null;
					};
		g1 = {
			react_stack_bottom_frame: function (P) {
				return P();
			},
		};
		var T,
			l = {},
			d = g1.react_stack_bottom_frame.bind(g1, h0)(),
			A0 = j2(C0(h0)),
			j0 = {};
		((ww.Fragment = p0),
			(ww.jsxDEV = function (P, o, F0, P0) {
				var I0 = 1e4 > G2.recentlyCreatedOwnerStacks++;
				return I(P, o, F0, P0, I0 ? Error('react-stack-top-frame') : d, I0 ? j2(C0(P)) : A0);
			}));
	})();
});
var AQ = n2(uX(), 1),
	jQ = n2(qQ(), 1);
var WQ = n2(uX(), 1),
	KQ = n2(j4(), 1);
function wQ(h) {
	let [q0, O0] = WQ.useState(!1);
	function C0() {
		navigator.clipboard.writeText(h.text).then(() => {
			(O0(!0), setTimeout(() => O0(!1), 2000));
		});
	}
	return KQ.jsxDEV(
		'button',
		{
			type: 'button',
			onClick: C0,
			className:
				'inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50',
			children: q0 ? 'Copied!' : 'Copy',
		},
		void 0,
		!1,
		void 0,
		this,
	);
}
var l0 = n2(j4(), 1);
function OQ(h) {
	let q0 = `${h.baseUrl}/mcp`;
	return l0.jsxDEV(
		'main',
		{
			className: 'mx-auto mt-12 w-full max-w-3xl px-6',
			children: l0.jsxDEV(
				'div',
				{
					className:
						'rounded-3xl border border-slate-200 bg-white p-10 shadow-lg shadow-slate-200/40',
					children: [
						l0.jsxDEV(
							'p',
							{
								className: 'text-xs font-semibold uppercase tracking-[0.2em] text-sky-700',
								children: 'Protokit',
							},
							void 0,
							!1,
							void 0,
							this,
						),
						l0.jsxDEV(
							'h1',
							{
								className: 'mt-3 text-4xl font-black tracking-tight text-slate-900',
								children: 'MCP OAuth Server',
							},
							void 0,
							!1,
							void 0,
							this,
						),
						l0.jsxDEV(
							'p',
							{
								className: 'mt-4 text-lg text-slate-600',
								children: 'Bun-native React server with OAuth, MCP transport, and Google sign-in.',
							},
							void 0,
							!1,
							void 0,
							this,
						),
						h.user
							? l0.jsxDEV(
									'section',
									{
										className: 'mt-8 rounded-2xl bg-slate-50 p-6',
										children: [
											l0.jsxDEV(
												'p',
												{
													className: 'text-sm font-medium text-slate-500',
													children: 'Signed in as',
												},
												void 0,
												!1,
												void 0,
												this,
											),
											l0.jsxDEV(
												'p',
												{
													className: 'mt-2 text-xl font-bold text-slate-900',
													children: h.user.email,
												},
												void 0,
												!1,
												void 0,
												this,
											),
											l0.jsxDEV(
												'div',
												{
													className: 'mt-5 flex flex-wrap items-center gap-3',
													children: [
														l0.jsxDEV(
															'a',
															{
																href: '/oauth/authorize',
																className:
																	'inline-flex items-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500',
																children: 'Review OAuth Request',
															},
															void 0,
															!1,
															void 0,
															this,
														),
														l0.jsxDEV(
															'form',
															{
																method: 'POST',
																action: '/auth/sign-out',
																children: l0.jsxDEV(
																	'button',
																	{
																		type: 'submit',
																		className:
																			'inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100',
																		children: 'Sign Out',
																	},
																	void 0,
																	!1,
																	void 0,
																	this,
																),
															},
															void 0,
															!1,
															void 0,
															this,
														),
													],
												},
												void 0,
												!0,
												void 0,
												this,
											),
										],
									},
									void 0,
									!0,
									void 0,
									this,
								)
							: l0.jsxDEV(
									'section',
									{
										className: 'mt-8 rounded-2xl bg-slate-50 p-6',
										children: [
											l0.jsxDEV(
												'p',
												{
													className: 'text-slate-600',
													children: 'Sign in with Google to authorize OAuth clients.',
												},
												void 0,
												!1,
												void 0,
												this,
											),
											l0.jsxDEV(
												'a',
												{
													href: '/auth/google/start?callback_path=/',
													className:
														'mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500',
													children: 'Continue With Google',
												},
												void 0,
												!1,
												void 0,
												this,
											),
										],
									},
									void 0,
									!0,
									void 0,
									this,
								),
						l0.jsxDEV(
							'section',
							{
								className:
									'mt-8 grid gap-4 rounded-2xl border border-slate-200 p-6 text-sm text-slate-600 md:grid-cols-2',
								children: [
									l0.jsxDEV(
										'div',
										{
											children: [
												l0.jsxDEV(
													'div',
													{
														className: 'flex items-center gap-2',
														children: [
															l0.jsxDEV(
																'p',
																{
																	className: 'font-semibold text-slate-900',
																	children: 'MCP Endpoint',
																},
																void 0,
																!1,
																void 0,
																this,
															),
															l0.jsxDEV(wQ, { text: q0 }, void 0, !1, void 0, this),
														],
													},
													void 0,
													!0,
													void 0,
													this,
												),
												l0.jsxDEV(
													'code',
													{ className: 'mt-1 block text-xs text-sky-700', children: q0 },
													void 0,
													!1,
													void 0,
													this,
												),
											],
										},
										void 0,
										!0,
										void 0,
										this,
									),
									l0.jsxDEV(
										'div',
										{
											children: [
												l0.jsxDEV(
													'p',
													{
														className: 'font-semibold text-slate-900',
														children: 'Authorization Metadata',
													},
													void 0,
													!1,
													void 0,
													this,
												),
												l0.jsxDEV(
													'code',
													{
														className: 'mt-1 block text-xs text-sky-700',
														children: [h.baseUrl, '/.well-known/oauth-authorization-server'],
													},
													void 0,
													!0,
													void 0,
													this,
												),
											],
										},
										void 0,
										!0,
										void 0,
										this,
									),
								],
							},
							void 0,
							!0,
							void 0,
							this,
						),
					],
				},
				void 0,
				!0,
				void 0,
				this,
			),
		},
		void 0,
		!1,
		void 0,
		this,
	);
}
var Kw = { home: OQ };
function _Q(h) {
	let q0 = Kw[h];
	if (!q0) throw Error(`Unknown page: "${h}". Register it in src/client/page-registry.ts`);
	return q0;
}
var LQ = document.getElementById('__SERVER_DATA__');
if (LQ) {
	let h = JSON.parse(LQ.textContent ?? '{}'),
		q0 = document.getElementById('application-root');
	if (q0 && h.page) {
		let O0 = _Q(h.page);
		jQ.hydrateRoot(q0, AQ.createElement(O0, h));
	}
}

//# debugId=DFFA575029CCDE6064756E2164756E21
