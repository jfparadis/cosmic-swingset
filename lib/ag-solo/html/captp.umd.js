(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = global || self, factory(global.CapTP = {}));
}(this, function (exports) { 'use strict';

  // Adapted from SES/Caja - Copyright (C) 2011 Google Inc.
  // Copyright (C) 2018 Agoric

  // Licensed under the Apache License, Version 2.0 (the "License");
  // you may not use this file except in compliance with the License.
  // You may obtain a copy of the License at
  //
  // http://www.apache.org/licenses/LICENSE-2.0
  //
  // Unless required by applicable law or agreed to in writing, software
  // distributed under the License is distributed on an "AS IS" BASIS,
  // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  // See the License for the specific language governing permissions and
  // limitations under the License.

  // based upon:
  // https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
  // https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js
  // then copied from proposal-frozen-realms deep-freeze.js
  // then copied from SES/src/bundle/deepFreeze.js

  function makeHardener(initialFringe) {
    const { freeze, getOwnPropertyDescriptors, getPrototypeOf } = Object;
    const { ownKeys } = Reflect;
    // Objects that we won't freeze, either because we've frozen them already,
    // or they were one of the initial roots (terminals). These objects form
    // the "fringe" of the hardened object graph.
    const fringeSet = new WeakSet(initialFringe);

    function harden(root) {
      const toFreeze = new Set();
      const prototypes = new Map();
      const paths = new WeakMap();

      // If val is something we should be freezing but aren't yet,
      // add it to toFreeze.
      function enqueue(val, path) {
        if (Object(val) !== val) {
          // ignore primitives
          return;
        }
        const type = typeof val;
        if (type !== 'object' && type !== 'function') {
          // future proof: break until someone figures out what it should do
          throw new TypeError(`Unexpected typeof: ${type}`);
        }
        if (fringeSet.has(val) || toFreeze.has(val)) {
          // Ignore if this is an exit, or we've already visited it
          return;
        }
        // console.log(`adding ${val} to toFreeze`, val);
        toFreeze.add(val);
        paths.set(val, path);
      }

      function freezeAndTraverse(obj) {
        // Immediately freeze the object to ensure reactive
        // objects such as proxies won't add properties
        // during traversal, before they get frozen.

        // Object are verified before being enqueued,
        // therefore this is a valid candidate.
        // Throws if this fails (strict mode).
        freeze(obj);

        // we rely upon certain commitments of Object.freeze and proxies here

        // get stable/immutable outbound links before a Proxy has a chance to do
        // something sneaky.
        const proto = getPrototypeOf(obj);
        const descs = getOwnPropertyDescriptors(obj);
        const path = paths.get(obj) || 'unknown';

        // console.log(`adding ${proto} to prototypes under ${path}`);
        if (proto !== null && !prototypes.has(proto)) {
          prototypes.set(proto, path);
          paths.set(proto, `${path}.__proto__`);
        }

        ownKeys(descs).forEach(name => {
          const pathname = `${path}.${String(name)}`;
          // todo uncurried form
          // todo: getOwnPropertyDescriptors is guaranteed to return well-formed
          // descriptors, but they still inherit from Object.prototype. If
          // someone has poisoned Object.prototype to add 'value' or 'get'
          // properties, then a simple 'if ("value" in desc)' or 'desc.value'
          // test could be confused. We use hasOwnProperty to be sure about
          // whether 'value' is present or not, which tells us for sure that this
          // is a data property.
          const desc = descs[name];
          if ('value' in desc) {
            // todo uncurried form
            enqueue(desc.value, `${pathname}`);
          } else {
            enqueue(desc.get, `${pathname}(get)`);
            enqueue(desc.set, `${pathname}(set)`);
          }
        });
      }

      function dequeue() {
        // New values added before forEach() has finished will be visited.
        toFreeze.forEach(freezeAndTraverse); // todo curried forEach
      }

      function checkPrototypes() {
        prototypes.forEach((path, p) => {
          if (!(toFreeze.has(p) || fringeSet.has(p))) {
            // all reachable properties have already been frozen by this point
            throw new TypeError(
              `prototype ${p} of ${path} is not already in the fringeSet`,
            );
          }
        });
      }

      function commit() {
        // todo curried forEach
        // we capture the real WeakSet.prototype.add above, in case someone
        // changes it. The two-argument form of forEach passes the second
        // argument as the 'this' binding, so we add to the correct set.
        toFreeze.forEach(fringeSet.add, fringeSet);
      }

      enqueue(root);
      dequeue();
      // console.log("fringeSet", fringeSet);
      // console.log("prototype set:", prototypes);
      // console.log("toFreeze set:", toFreeze);
      checkPrototypes();
      commit();

      return root;
    }

    return harden;
  }

  // Copyright (C) 2011 Google Inc.
  // Copyright (C) 2018 Agoric
  //
  // Licensed under the Apache License, Version 2.0 (the "License");
  // you may not use this file except in compliance with the License.
  // You may obtain a copy of the License at
  //
  // https://www.apache.org/licenses/LICENSE-2.0
  //
  // Unless required by applicable law or agreed to in writing, software
  // distributed under the License is distributed on an "AS IS" BASIS,
  // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  // See the License for the specific language governing permissions and
  // limitations under the License.

  // TODO(erights): We should test for
  // We now have a reason to omit Proxy from the whitelist.
  // The makeBrandTester in repairES5 uses Allen's trick at
  // https://esdiscuss.org/topic/tostringtag-spoofing-for-null-and-undefined#content-59
  // , but testing reveals that, on FF 35.0.1, a proxy on an exotic
  // object X will pass this brand test when X will. This is fixed as of
  // FF Nightly 38.0a1.

  /**
   * <p>Qualifying platforms generally include all JavaScript platforms
   * shown on <a href="http://kangax.github.com/es5-compat-table/"
   * >ECMAScript 5 compatibility table</a> that implement {@code
   * Object.getOwnPropertyNames}. At the time of this writing,
   * qualifying browsers already include the latest released versions of
   * Internet Explorer (9), Firefox (4), Chrome (11), and Safari
   * (5.0.5), their corresponding standalone (e.g., server-side) JavaScript
   * engines, Rhino 1.73, and BESEN.
   *
   * <p>On such not-quite-ES5 platforms, some elements of these
   * emulations may lose SES safety, as enumerated in the comment on
   * each problem record in the {@code baseProblems} and {@code
   * supportedProblems} array below. The platform must at least provide
   * {@code Object.getOwnPropertyNames}, because it cannot reasonably be
   * emulated.
   *
   * <p>This file is useful by itself, as it has no dependencies on the
   * rest of SES. It creates no new global bindings, but merely repairs
   * standard globals or standard elements reachable from standard
   * globals. If the future-standard {@code WeakMap} global is present,
   * as it is currently on FF7.0a1, then it will repair it in place. The
   * one non-standard element that this file uses is {@code console} if
   * present, in order to report the repairs it found necessary, in
   * which case we use its {@code log, info, warn}, and {@code error}
   * methods. If {@code console.log} is absent, then this file performs
   * its repairs silently.
   *
   * <p>Generally, this file should be run as the first script in a
   * JavaScript context (i.e. a browser frame), as it relies on other
   * primordial objects and methods not yet being perturbed.
   *
   * <p>TODO(erights): This file tries to protect itself from some
   * post-initialization perturbation by stashing some of the
   * primordials it needs for later use, but this attempt is currently
   * incomplete. We need to revisit this when we support Confined-ES5,
   * as a variant of SES in which the primordials are not frozen. See
   * previous failed attempt at <a
   * href="https://codereview.appspot.com/5278046/" >Speeds up
   * WeakMap. Preparing to support unfrozen primordials.</a>. From
   * analysis of this failed attempt, it seems that the only practical
   * way to support CES is by use of two frames, where most of initSES
   * runs in a SES frame, and so can avoid worrying about most of these
   * perturbations.
   */
  function getAnonIntrinsics(global) {

    const gopd = Object.getOwnPropertyDescriptor;
    const getProto = Object.getPrototypeOf;

    // ////////////// Undeniables and Intrinsics //////////////

    /**
     * The undeniables are the primordial objects which are ambiently
     * reachable via compositions of strict syntax, primitive wrapping
     * (new Object(x)), and prototype navigation (the equivalent of
     * Object.getPrototypeOf(x) or x.__proto__). Although we could in
     * theory monkey patch primitive wrapping or prototype navigation,
     * we won't. Hence, without parsing, the following are undeniable no
     * matter what <i>other</i> monkey patching we do to the primordial
     * environment.
     */

    // The first element of each undeniableTuple is a string used to
    // name the undeniable object for reporting purposes. It has no
    // other programmatic use.
    //
    // The second element of each undeniableTuple should be the
    // undeniable itself.
    //
    // The optional third element of the undeniableTuple, if present,
    // should be an example of syntax, rather than use of a monkey
    // patchable API, evaluating to a value from which the undeniable
    // object in the second element can be reached by only the
    // following steps:
    // If the value is primitve, convert to an Object wrapper.
    // Is the resulting object either the undeniable object, or does
    // it inherit directly from the undeniable object?

    function* aStrictGenerator() {} // eslint-disable-line no-empty-function
    const Generator = getProto(aStrictGenerator);
    async function* aStrictAsyncGenerator() {} // eslint-disable-line no-empty-function
    const AsyncGenerator = getProto(aStrictAsyncGenerator);
    async function aStrictAsyncFunction() {} // eslint-disable-line no-empty-function
    const AsyncFunctionPrototype = getProto(aStrictAsyncFunction);

    // TODO: this is dead code, but could be useful: make this the
    // 'undeniables' object available via some API.

    const undeniableTuples = [
      ['Object.prototype', Object.prototype, {}],
      ['Function.prototype', Function.prototype, function foo() {}],
      ['Array.prototype', Array.prototype, []],
      ['RegExp.prototype', RegExp.prototype, /x/],
      ['Boolean.prototype', Boolean.prototype, true],
      ['Number.prototype', Number.prototype, 1],
      ['String.prototype', String.prototype, 'x'],
      ['%Generator%', Generator, aStrictGenerator],
      ['%AsyncGenerator%', AsyncGenerator, aStrictAsyncGenerator],
      ['%AsyncFunction%', AsyncFunctionPrototype, aStrictAsyncFunction],
    ];

    undeniableTuples.forEach(tuple => {
      const name = tuple[0];
      const undeniable = tuple[1];
      let start = tuple[2];
      if (start === undefined) {
        return;
      }
      start = Object(start);
      if (undeniable === start) {
        return;
      }
      if (undeniable === getProto(start)) {
        return;
      }
      throw new Error(`Unexpected undeniable: ${undeniable}`);
    });

    function registerIteratorProtos(registery, base, name) {
      const iteratorSym =
        (global.Symbol && global.Symbol.iterator) || '@@iterator'; // used instead of a symbol on FF35

      if (base[iteratorSym]) {
        const anIter = base[iteratorSym]();
        const anIteratorPrototype = getProto(anIter);
        registery[name] = anIteratorPrototype; // eslint-disable-line no-param-reassign
        const anIterProtoBase = getProto(anIteratorPrototype);
        if (anIterProtoBase !== Object.prototype) {
          if (!registery.IteratorPrototype) {
            if (getProto(anIterProtoBase) !== Object.prototype) {
              throw new Error(
                '%IteratorPrototype%.__proto__ was not Object.prototype',
              );
            }
            registery.IteratorPrototype = anIterProtoBase; // eslint-disable-line no-param-reassign
          } else if (registery.IteratorPrototype !== anIterProtoBase) {
            throw new Error(`unexpected %${name}%.__proto__`);
          }
        }
      }
    }

    /**
     * Get the intrinsics not otherwise reachable by named own property
     * traversal. See
     * https://people.mozilla.org/~jorendorff/es6-draft.html#sec-well-known-intrinsic-objects
     * and the instrinsics section of whitelist.js
     *
     * <p>Unlike getUndeniables(), the result of sampleAnonIntrinsics()
     * does depend on the current state of the primordials, so we must
     * run this again after all other relevant monkey patching is done,
     * in order to properly initialize cajaVM.intrinsics
     */

    // TODO: we can probably unwrap this into the outer function, and stop
    // using a separately named 'sampleAnonIntrinsics'
    function sampleAnonIntrinsics() {
      const result = {};

      // If there are still other ThrowTypeError objects left after
      // noFuncPoison-ing, this should be caught by
      // test_THROWTYPEERROR_NOT_UNIQUE below, so we assume here that
      // this is the only surviving ThrowTypeError intrinsic.
      // eslint-disable-next-line prefer-rest-params
      result.ThrowTypeError = gopd(arguments, 'callee').get;

      // Get the ES6 %ArrayIteratorPrototype%,
      // %StringIteratorPrototype%, %MapIteratorPrototype%,
      // %SetIteratorPrototype% and %IteratorPrototype% intrinsics, if
      // present.
      registerIteratorProtos(result, [], 'ArrayIteratorPrototype');
      registerIteratorProtos(result, '', 'StringIteratorPrototype');
      if (typeof Map === 'function') {
        registerIteratorProtos(result, new Map(), 'MapIteratorPrototype');
      }
      if (typeof Set === 'function') {
        registerIteratorProtos(result, new Set(), 'SetIteratorPrototype');
      }

      // Get the ES6 %GeneratorFunction% intrinsic, if present.
      if (getProto(Generator) !== Function.prototype) {
        throw new Error('Generator.__proto__ was not Function.prototype');
      }
      const GeneratorFunction = Generator.constructor;
      if (getProto(GeneratorFunction) !== Function.prototype.constructor) {
        throw new Error(
          'GeneratorFunction.__proto__ was not Function.prototype.constructor',
        );
      }
      result.GeneratorFunction = GeneratorFunction;
      const genProtoBase = getProto(Generator.prototype);
      if (genProtoBase !== result.IteratorPrototype) {
        throw new Error('Unexpected Generator.prototype.__proto__');
      }

      // Get the ES6 %AsyncGeneratorFunction% intrinsic, if present.
      if (getProto(AsyncGenerator) !== Function.prototype) {
        throw new Error('AsyncGenerator.__proto__ was not Function.prototype');
      }
      const AsyncGeneratorFunction = AsyncGenerator.constructor;
      if (getProto(AsyncGeneratorFunction) !== Function.prototype.constructor) {
        throw new Error(
          'GeneratorFunction.__proto__ was not Function.prototype.constructor',
        );
      }
      result.AsyncGeneratorFunction = AsyncGeneratorFunction;
      // it appears that the only way to get an AsyncIteratorPrototype is
      // through this getProto() process, so there's nothing to check it
      // against
      /*
        const agenProtoBase = getProto(AsyncGenerator.prototype);
        if (agenProtoBase !== result.AsyncIteratorPrototype) {
          throw new Error('Unexpected AsyncGenerator.prototype.__proto__');
        } */

      // Get the ES6 %AsyncFunction% intrinsic, if present.
      if (getProto(AsyncFunctionPrototype) !== Function.prototype) {
        throw new Error(
          'AsyncFunctionPrototype.__proto__ was not Function.prototype',
        );
      }
      const AsyncFunction = AsyncFunctionPrototype.constructor;
      if (getProto(AsyncFunction) !== Function.prototype.constructor) {
        throw new Error(
          'AsyncFunction.__proto__ was not Function.prototype.constructor',
        );
      }
      result.AsyncFunction = AsyncFunction;

      // Get the ES6 %TypedArray% intrinsic, if present.
      (function getTypedArray() {
        if (!global.Float32Array) {
          return;
        }
        const TypedArray = getProto(global.Float32Array);
        if (TypedArray === Function.prototype) {
          return;
        }
        if (getProto(TypedArray) !== Function.prototype) {
          // http://bespin.cz/~ondras/html/classv8_1_1ArrayBufferView.html
          // has me worried that someone might make such an intermediate
          // object visible.
          throw new Error('TypedArray.__proto__ was not Function.prototype');
        }
        result.TypedArray = TypedArray;
      })();

      Object.keys(result).forEach(name => {
        if (result[name] === undefined) {
          throw new Error(`Malformed intrinsic: ${name}`);
        }
      });

      return result;
    }

    return sampleAnonIntrinsics();
  }

  // Copyright (C) 2011 Google Inc.
  // Copyright (C) 2018 Agoric
  //
  // Licensed under the Apache License, Version 2.0 (the "License");
  // you may not use this file except in compliance with the License.
  // You may obtain a copy of the License at
  //
  // http://www.apache.org/licenses/LICENSE-2.0
  //
  // Unless required by applicable law or agreed to in writing, software
  // distributed under the License is distributed on an "AS IS" BASIS,
  // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  // See the License for the specific language governing permissions and
  // limitations under the License.

  /**
   * @fileoverview Exports {@code ses.whitelist}, a recursively defined
   * JSON record enumerating all the naming paths in the ES5.1 spec,
   * those de-facto extensions that we judge to be safe, and SES and
   * Dr. SES extensions provided by the SES runtime.
   *
   * <p>Assumes only ES3. Compatible with ES5, ES5-strict, or
   * anticipated ES6.
   *
   * //provides ses.whitelist
   * @author Mark S. Miller,
   * @overrides ses, whitelistModule
   */

  /**
   * <p>Each JSON record enumerates the disposition of the properties on
   * some corresponding primordial object, with the root record
   * representing the global object. For each such record, the values
   * associated with its property names can be
   * <ul>
   * <li>Another record, in which case this property is simply
   *     whitelisted and that next record represents the disposition of
   *     the object which is its value. For example, {@code "Object"}
   *     leads to another record explaining what properties {@code
   *     "Object"} may have and how each such property, if present,
   *     and its value should be tamed.
   * <li>true, in which case this property is simply whitelisted. The
   *     value associated with that property is still traversed and
   *     tamed, but only according to the taming of the objects that
   *     object inherits from. For example, {@code "Object.freeze"} leads
   *     to true, meaning that the {@code "freeze"} property of {@code
   *     Object} should be whitelisted and the value of the property (a
   *     function) should be further tamed only according to the
   *     markings of the other objects it inherits from, like {@code
   *     "Function.prototype"} and {@code "Object.prototype").
   *     If the property is an accessor property, it is not
   *     whitelisted (as invoking an accessor might not be meaningful,
   *     yet the accessor might return a value needing taming).
   * <li>"maybeAccessor", in which case this accessor property is simply
   *     whitelisted and its getter and/or setter are tamed according to
   *     inheritance. If the property is not an accessor property, its
   *     value is tamed according to inheritance.
   * <li>"*", in which case this property on this object is whitelisted,
   *     as is this property as inherited by all objects that inherit
   *     from this object. The values associated with all such properties
   *     are still traversed and tamed, but only according to the taming
   *     of the objects that object inherits from. For example, {@code
   *     "Object.prototype.constructor"} leads to "*", meaning that we
   *     whitelist the {@code "constructor"} property on {@code
   *     Object.prototype} and on every object that inherits from {@code
   *     Object.prototype} that does not have a conflicting mark. Each
   *     of these is tamed as if with true, so that the value of the
   *     property is further tamed according to what other objects it
   *     inherits from.
   * <li>false, which suppresses permission inherited via "*".
   * </ul>
   *
   * <p>TODO: We want to do for constructor: something weaker than '*',
   * but rather more like what we do for [[Prototype]] links, which is
   * that it is whitelisted only if it points at an object which is
   * otherwise reachable by a whitelisted path.
   *
   * <p>The members of the whitelist are either
   * <ul>
   * <li>(uncommented) defined by the ES5.1 normative standard text,
   * <li>(questionable) provides a source of non-determinism, in
   *     violation of pure object-capability rules, but allowed anyway
   *     since we've given up on restricting JavaScript to a
   *     deterministic subset.
   * <li>(ES5 Appendix B) common elements of de facto JavaScript
   *     described by the non-normative Appendix B.
   * <li>(Harmless whatwg) extensions documented at
   *     <a href="http://wiki.whatwg.org/wiki/Web_ECMAScript"
   *     >http://wiki.whatwg.org/wiki/Web_ECMAScript</a> that seem to be
   *     harmless. Note that the RegExp constructor extensions on that
   *     page are <b>not harmless</b> and so must not be whitelisted.
   * <li>(ES-Harmony proposal) accepted as "proposal" status for
   *     EcmaScript-Harmony.
   * </ul>
   *
   * <p>With the above encoding, there are some sensible whitelists we
   * cannot express, such as marking a property both with "*" and a JSON
   * record. This is an expedient decision based only on not having
   * encountered such a need. Should we need this extra expressiveness,
   * we'll need to refactor to enable a different encoding.
   *
   * <p>We factor out {@code true} into the variable {@code t} just to
   * get a bit better compression from simple minifiers.
   */

  const t = true;
  const j = true; // included in the Jessie runtime

  let TypedArrayWhitelist; // defined and used below

  const whitelist = {
    // The accessible intrinsics which are not reachable by own
    // property name traversal are listed here so that they are
    // processed by the whitelist, although this also makes them
    // accessible by this path.  See
    // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-well-known-intrinsic-objects
    // Of these, ThrowTypeError is the only one from ES5. All the
    // rest were introduced in ES6.
    anonIntrinsics: {
      ThrowTypeError: {},
      IteratorPrototype: {
        // 25.1
        // Technically, for SES-on-ES5, we should not need to
        // whitelist 'next'. However, browsers are accidentally
        // relying on it
        // https://bugs.chromium.org/p/v8/issues/detail?id=4769#
        // https://bugs.webkit.org/show_bug.cgi?id=154475
        // and we will be whitelisting it as we transition to ES6
        // anyway, so we unconditionally whitelist it now.
        next: '*',
        constructor: false,
      },
      ArrayIteratorPrototype: {},
      StringIteratorPrototype: {},
      MapIteratorPrototype: {},
      SetIteratorPrototype: {},

      // The %GeneratorFunction% intrinsic is the constructor of
      // generator functions, so %GeneratorFunction%.prototype is
      // the %Generator% intrinsic, which all generator functions
      // inherit from. A generator function is effectively the
      // constructor of its generator instances, so, for each
      // generator function (e.g., "g1" on the diagram at
      // http://people.mozilla.org/~jorendorff/figure-2.png )
      // its .prototype is a prototype that its instances inherit
      // from. Paralleling this structure, %Generator%.prototype,
      // i.e., %GeneratorFunction%.prototype.prototype, is the
      // object that all these generator function prototypes inherit
      // from. The .next, .return and .throw that generator
      // instances respond to are actually the builtin methods they
      // inherit from this object.
      GeneratorFunction: {
        // 25.2
        length: '*', // Not sure why this is needed
        prototype: {
          // 25.4
          prototype: {
            next: '*',
            return: '*',
            throw: '*',
            constructor: '*', // Not sure why this is needed
          },
        },
      },
      AsyncGeneratorFunction: {
        // 25.3
        length: '*',
        prototype: {
          // 25.5
          prototype: {
            next: '*',
            return: '*',
            throw: '*',
            constructor: '*', // Not sure why this is needed
          },
        },
      },
      AsyncFunction: {
        // 25.7
        length: '*',
        prototype: '*',
      },

      TypedArray: (TypedArrayWhitelist = {
        // 22.2
        length: '*', // does not inherit from Function.prototype on Chrome
        name: '*', // ditto
        from: t,
        of: t,
        BYTES_PER_ELEMENT: '*',
        prototype: {
          buffer: 'maybeAccessor',
          byteLength: 'maybeAccessor',
          byteOffset: 'maybeAccessor',
          copyWithin: '*',
          entries: '*',
          every: '*',
          fill: '*',
          filter: '*',
          find: '*',
          findIndex: '*',
          forEach: '*',
          includes: '*',
          indexOf: '*',
          join: '*',
          keys: '*',
          lastIndexOf: '*',
          length: 'maybeAccessor',
          map: '*',
          reduce: '*',
          reduceRight: '*',
          reverse: '*',
          set: '*',
          slice: '*',
          some: '*',
          sort: '*',
          subarray: '*',
          values: '*',
          BYTES_PER_ELEMENT: '*',
        },
      }),
    },

    namedIntrinsics: {
      // In order according to
      // http://www.ecma-international.org/ecma-262/ with chapter
      // numbers where applicable

      // 18 The Global Object

      // 18.1
      Infinity: j,
      NaN: j,
      undefined: j,

      // 18.2
      // eval: t,                      // Whitelisting under separate control
      // by TAME_GLOBAL_EVAL in startSES.js
      isFinite: t,
      isNaN: t,
      parseFloat: t,
      parseInt: t,
      decodeURI: t,
      decodeURIComponent: t,
      encodeURI: t,
      encodeURIComponent: t,

      // 19 Fundamental Objects

      Object: {
        // 19.1
        assign: t, // ES-Harmony
        create: t,
        defineProperties: t, // ES-Harmony
        defineProperty: t,
        entries: t, // ES-Harmony
        freeze: j,
        getOwnPropertyDescriptor: t,
        getOwnPropertyDescriptors: t, // proposed ES-Harmony
        getOwnPropertyNames: t,
        getOwnPropertySymbols: t, // ES-Harmony
        getPrototypeOf: t,
        is: j, // ES-Harmony
        isExtensible: t,
        isFrozen: t,
        isSealed: t,
        keys: t,
        preventExtensions: j,
        seal: j,
        setPrototypeOf: t, // ES-Harmony
        values: t, // ES-Harmony

        prototype: {
          // B.2.2
          // __proto__: t, whitelisted manually in startSES.js
          __defineGetter__: t,
          __defineSetter__: t,
          __lookupGetter__: t,
          __lookupSetter__: t,

          constructor: '*',
          hasOwnProperty: t,
          isPrototypeOf: t,
          propertyIsEnumerable: t,
          toLocaleString: '*',
          toString: '*',
          valueOf: '*',

          // Generally allowed
          [Symbol.iterator]: '*',
          [Symbol.toPrimitive]: '*',
          [Symbol.toStringTag]: '*',
          [Symbol.unscopables]: '*',
        },
      },

      Function: {
        // 19.2
        length: t,
        prototype: {
          apply: t,
          bind: t,
          call: t,
          [Symbol.hasInstance]: '*',

          // 19.2.4 instances
          length: '*',
          name: '*', // ES-Harmony
          prototype: '*',
          arity: '*', // non-std, deprecated in favor of length

          // Generally allowed
          [Symbol.species]: 'maybeAccessor', // ES-Harmony?
        },
      },

      Boolean: {
        // 19.3
        prototype: t,
      },

      Symbol: {
        // 19.4               all ES-Harmony
        asyncIterator: t, // proposed? ES-Harmony
        for: t,
        hasInstance: t,
        isConcatSpreadable: t,
        iterator: t,
        keyFor: t,
        match: t,
        replace: t,
        search: t,
        species: t,
        split: t,
        toPrimitive: t,
        toStringTag: t,
        unscopables: t,
        prototype: t,
      },

      Error: {
        // 19.5
        prototype: {
          name: '*',
          message: '*',
        },
      },
      // In ES6 the *Error "subclasses" of Error inherit from Error,
      // since constructor inheritance generally mirrors prototype
      // inheritance. As explained at
      // https://code.google.com/p/google-caja/issues/detail?id=1963 ,
      // debug.js hides away the Error constructor itself, and so needs
      // to rewire these "subclass" constructors. Until we have a more
      // general mechanism, please maintain this list of whitelisted
      // subclasses in sync with the list in debug.js of subclasses to
      // be rewired.
      EvalError: {
        prototype: t,
      },
      RangeError: {
        prototype: t,
      },
      ReferenceError: {
        prototype: t,
      },
      SyntaxError: {
        prototype: t,
      },
      TypeError: {
        prototype: t,
      },
      URIError: {
        prototype: t,
      },

      // 20 Numbers and Dates

      Number: {
        // 20.1
        EPSILON: t, // ES-Harmony
        isFinite: j, // ES-Harmony
        isInteger: t, // ES-Harmony
        isNaN: j, // ES-Harmony
        isSafeInteger: j, // ES-Harmony
        MAX_SAFE_INTEGER: j, // ES-Harmony
        MAX_VALUE: t,
        MIN_SAFE_INTEGER: j, // ES-Harmony
        MIN_VALUE: t,
        NaN: t,
        NEGATIVE_INFINITY: t,
        parseFloat: t, // ES-Harmony
        parseInt: t, // ES-Harmony
        POSITIVE_INFINITY: t,
        prototype: {
          toExponential: t,
          toFixed: t,
          toPrecision: t,
        },
      },

      Math: {
        // 20.2
        E: j,
        LN10: j,
        LN2: j,
        LOG10E: t,
        LOG2E: t,
        PI: j,
        SQRT1_2: t,
        SQRT2: t,

        abs: j,
        acos: t,
        acosh: t, // ES-Harmony
        asin: t,
        asinh: t, // ES-Harmony
        atan: t,
        atanh: t, // ES-Harmony
        atan2: t,
        cbrt: t, // ES-Harmony
        ceil: j,
        clz32: t, // ES-Harmony
        cos: t,
        cosh: t, // ES-Harmony
        exp: t,
        expm1: t, // ES-Harmony
        floor: j,
        fround: t, // ES-Harmony
        hypot: t, // ES-Harmony
        imul: t, // ES-Harmony
        log: j,
        log1p: t, // ES-Harmony
        log10: j, // ES-Harmony
        log2: j, // ES-Harmony
        max: j,
        min: j,
        pow: j,
        random: t, // questionable
        round: j,
        sign: t, // ES-Harmony
        sin: t,
        sinh: t, // ES-Harmony
        sqrt: j,
        tan: t,
        tanh: t, // ES-Harmony
        trunc: j, // ES-Harmony
      },

      // no-arg Date constructor is questionable
      Date: {
        // 20.3
        now: t, // questionable
        parse: t,
        UTC: t,
        prototype: {
          // Note: coordinate this list with maintanence of repairES5.js
          getDate: t,
          getDay: t,
          getFullYear: t,
          getHours: t,
          getMilliseconds: t,
          getMinutes: t,
          getMonth: t,
          getSeconds: t,
          getTime: t,
          getTimezoneOffset: t,
          getUTCDate: t,
          getUTCDay: t,
          getUTCFullYear: t,
          getUTCHours: t,
          getUTCMilliseconds: t,
          getUTCMinutes: t,
          getUTCMonth: t,
          getUTCSeconds: t,
          setDate: t,
          setFullYear: t,
          setHours: t,
          setMilliseconds: t,
          setMinutes: t,
          setMonth: t,
          setSeconds: t,
          setTime: t,
          setUTCDate: t,
          setUTCFullYear: t,
          setUTCHours: t,
          setUTCMilliseconds: t,
          setUTCMinutes: t,
          setUTCMonth: t,
          setUTCSeconds: t,
          toDateString: t,
          toISOString: t,
          toJSON: t,
          toLocaleDateString: t,
          toLocaleString: t,
          toLocaleTimeString: t,
          toTimeString: t,
          toUTCString: t,

          // B.2.4
          getYear: t,
          setYear: t,
          toGMTString: t,
        },
      },

      // 21 Text Processing

      String: {
        // 21.2
        fromCharCode: j,
        fromCodePoint: t, // ES-Harmony
        raw: j, // ES-Harmony
        prototype: {
          charAt: t,
          charCodeAt: t,
          codePointAt: t, // ES-Harmony
          concat: t,
          endsWith: j, // ES-Harmony
          includes: t, // ES-Harmony
          indexOf: j,
          lastIndexOf: j,
          localeCompare: t,
          match: t,
          normalize: t, // ES-Harmony
          padEnd: t, // ES-Harmony
          padStart: t, // ES-Harmony
          repeat: t, // ES-Harmony
          replace: t,
          search: t,
          slice: j,
          split: t,
          startsWith: j, // ES-Harmony
          substring: t,
          toLocaleLowerCase: t,
          toLocaleUpperCase: t,
          toLowerCase: t,
          toUpperCase: t,
          trim: t,

          // B.2.3
          substr: t,
          anchor: t,
          big: t,
          blink: t,
          bold: t,
          fixed: t,
          fontcolor: t,
          fontsize: t,
          italics: t,
          link: t,
          small: t,
          strike: t,
          sub: t,
          sup: t,

          trimLeft: t, // non-standard
          trimRight: t, // non-standard

          // 21.1.4 instances
          length: '*',
        },
      },

      RegExp: {
        // 21.2
        prototype: {
          exec: t,
          flags: 'maybeAccessor',
          global: 'maybeAccessor',
          ignoreCase: 'maybeAccessor',
          [Symbol.match]: '*', // ES-Harmony
          multiline: 'maybeAccessor',
          [Symbol.replace]: '*', // ES-Harmony
          [Symbol.search]: '*', // ES-Harmony
          source: 'maybeAccessor',
          [Symbol.split]: '*', // ES-Harmony
          sticky: 'maybeAccessor',
          test: t,
          unicode: 'maybeAccessor', // ES-Harmony
          dotAll: 'maybeAccessor', // proposed ES-Harmony

          // B.2.5
          compile: false, // UNSAFE. Purposely suppressed

          // 21.2.6 instances
          lastIndex: '*',
          options: '*', // non-std
        },
      },

      // 22 Indexed Collections

      Array: {
        // 22.1
        from: j,
        isArray: t,
        of: j, // ES-Harmony?
        prototype: {
          concat: t,
          copyWithin: t, // ES-Harmony
          entries: t, // ES-Harmony
          every: t,
          fill: t, // ES-Harmony
          filter: j,
          find: t, // ES-Harmony
          findIndex: t, // ES-Harmony
          forEach: j,
          includes: t, // ES-Harmony
          indexOf: j,
          join: t,
          keys: t, // ES-Harmony
          lastIndexOf: j,
          map: j,
          pop: j,
          push: j,
          reduce: j,
          reduceRight: j,
          reverse: t,
          shift: j,
          slice: j,
          some: t,
          sort: t,
          splice: t,
          unshift: j,
          values: t, // ES-Harmony

          // 22.1.4 instances
          length: '*',
        },
      },

      // 22.2 Typed Array stuff
      // TODO: Not yet organized according to spec order

      Int8Array: TypedArrayWhitelist,
      Uint8Array: TypedArrayWhitelist,
      Uint8ClampedArray: TypedArrayWhitelist,
      Int16Array: TypedArrayWhitelist,
      Uint16Array: TypedArrayWhitelist,
      Int32Array: TypedArrayWhitelist,
      Uint32Array: TypedArrayWhitelist,
      Float32Array: TypedArrayWhitelist,
      Float64Array: TypedArrayWhitelist,

      // 23 Keyed Collections          all ES-Harmony

      Map: {
        // 23.1
        prototype: {
          clear: j,
          delete: j,
          entries: j,
          forEach: j,
          get: j,
          has: j,
          keys: j,
          set: j,
          size: 'maybeAccessor',
          values: j,
        },
      },

      Set: {
        // 23.2
        prototype: {
          add: j,
          clear: j,
          delete: j,
          entries: j,
          forEach: j,
          has: j,
          keys: j,
          size: 'maybeAccessor',
          values: j,
        },
      },

      WeakMap: {
        // 23.3
        prototype: {
          // Note: coordinate this list with maintenance of repairES5.js
          delete: j,
          get: j,
          has: j,
          set: j,
        },
      },

      WeakSet: {
        // 23.4
        prototype: {
          add: j,
          delete: j,
          has: j,
        },
      },

      // 24 Structured Data

      ArrayBuffer: {
        // 24.1            all ES-Harmony
        isView: t,
        length: t, // does not inherit from Function.prototype on Chrome
        name: t, // ditto
        prototype: {
          byteLength: 'maybeAccessor',
          slice: t,
        },
      },

      // 24.2 TODO: Omitting SharedArrayBuffer for now

      DataView: {
        // 24.3               all ES-Harmony
        length: t, // does not inherit from Function.prototype on Chrome
        name: t, // ditto
        BYTES_PER_ELEMENT: '*', // non-standard. really?
        prototype: {
          buffer: 'maybeAccessor',
          byteOffset: 'maybeAccessor',
          byteLength: 'maybeAccessor',
          getFloat32: t,
          getFloat64: t,
          getInt8: t,
          getInt16: t,
          getInt32: t,
          getUint8: t,
          getUint16: t,
          getUint32: t,
          setFloat32: t,
          setFloat64: t,
          setInt8: t,
          setInt16: t,
          setInt32: t,
          setUint8: t,
          setUint16: t,
          setUint32: t,
        },
      },

      // 24.4 TODO: Omitting Atomics for now

      JSON: {
        // 24.5
        parse: j,
        stringify: j,
      },

      // 25 Control Abstraction Objects

      Promise: {
        // 25.4
        all: j,
        race: j,
        reject: j,
        resolve: j,
        prototype: {
          catch: t,
          then: j,
          finally: t, // proposed ES-Harmony

          // nanoq.js
          get: t,
          put: t,
          del: t,
          post: t,
          invoke: t,
          fapply: t,
          fcall: t,

          // Temporary compat with the old makeQ.js
          send: t,
          delete: t,
          end: t,
        },
      },

      // nanoq.js
      Q: {
        all: t,
        race: t,
        reject: t,
        resolve: t,

        join: t,
        isPassByCopy: t,
        passByCopy: t,
        makeRemote: t,
        makeFar: t,

        // Temporary compat with the old makeQ.js
        shorten: t,
        isPromise: t,
        async: t,
        rejected: t,
        promise: t,
        delay: t,
        memoize: t,
        defer: t,
      },

      // 26 Reflection

      Reflect: {
        // 26.1
        apply: t,
        construct: t,
        defineProperty: t,
        deleteProperty: t,
        get: t,
        getOwnPropertyDescriptor: t,
        getPrototypeOf: t,
        has: t,
        isExtensible: t,
        ownKeys: t,
        preventExtensions: t,
        set: t,
        setPrototypeOf: t,
      },

      Proxy: {
        // 26.2
        revocable: t,
      },

      // Appendix B

      // B.2.1
      escape: t,
      unescape: t,

      // B.2.5 (RegExp.prototype.compile) is marked 'false' up in 21.2

      // Other

      StringMap: {
        // A specialized approximation of ES-Harmony's Map.
        prototype: {}, // Technically, the methods should be on the prototype,
        // but doing so while preserving encapsulation will be
        // needlessly expensive for current usage.
      },

      Realm: {
        makeRootRealm: t,
        makeCompartment: t,
        prototype: {
          global: 'maybeAccessor',
          evaluate: t,
        },
      },

      SES: {
        confine: t,
        confineExpr: t,
      },

      Nat: j,
      def: j,
    },
  };

  // Copyright (C) 2011 Google Inc.

  const { create, getOwnPropertyDescriptors } = Object;

  function buildTable(global) {
    // walk global object, add whitelisted properties to table

    const uncurryThis = fn => (thisArg, ...args) =>
      Reflect.apply(fn, thisArg, args);
    const {
      getOwnPropertyDescriptor: gopd,
      getOwnPropertyNames: gopn,
      keys,
    } = Object;
    const getProto = Object.getPrototypeOf;
    const hop = uncurryThis(Object.prototype.hasOwnProperty);

    const whiteTable = new Map();

    function addToWhiteTable(rootValue, rootPermit) {
      /**
       * The whiteTable should map from each path-accessible primordial
       * object to the permit object that describes how it should be
       * cleaned.
       *
       * We initialize the whiteTable only so that {@code getPermit} can
       * process "*" inheritance using the whitelist, by walking actual
       * inheritance chains.
       */
      const whitelistSymbols = [true, false, '*', 'maybeAccessor'];
      function register(value, permit) {
        if (value !== Object(value)) {
          return;
        }
        if (typeof permit !== 'object') {
          if (whitelistSymbols.indexOf(permit) < 0) {
            throw new Error(
              `syntax error in whitelist; unexpected value: ${permit}`,
            );
          }
          return;
        }
        if (whiteTable.has(value)) {
          throw new Error('primordial reachable through multiple paths');
        }
        whiteTable.set(value, permit);
        keys(permit).forEach(name => {
          // Use gopd to avoid invoking an accessor property.
          // Accessor properties for which permit !== 'maybeAccessor'
          // are caught later by clean().
          const desc = gopd(value, name);
          if (desc) {
            register(desc.value, permit[name]);
          }
        });
      }
      register(rootValue, rootPermit);
    }

    /**
     * Should the property named {@code name} be whitelisted on the
     * {@code base} object, and if so, with what Permit?
     *
     * <p>If it should be permitted, return the Permit (where Permit =
     * true | "maybeAccessor" | "*" | Record(Permit)), all of which are
     * truthy. If it should not be permitted, return false.
     */
    function getPermit(base, name) {
      let permit = whiteTable.get(base);
      if (permit) {
        if (hop(permit, name)) {
          return permit[name];
        }
      }
      // eslint-disable-next-line no-constant-condition
      while (true) {
        base = getProto(base); // eslint-disable-line no-param-reassign
        if (base === null) {
          return false;
        }
        permit = whiteTable.get(base);
        if (permit && hop(permit, name)) {
          const result = permit[name];
          if (result === '*') {
            return result;
          }
          return false;
        }
      }
    }

    const fringeTable = new Set();
    /**
     * Walk the table, adding everything that's on the whitelist to a Set for
       later use.
     *
     */
    function addToFringeTable(value, prefix) {
      if (value !== Object(value)) {
        return;
      }
      if (fringeTable.has(value)) {
        return;
      }

      fringeTable.add(value);
      gopn(value).forEach(name => {
        const p = getPermit(value, name);
        if (p) {
          const desc = gopd(value, name);
          if (hop(desc, 'value')) {
            // Is a data property
            const subValue = desc.value;
            addToFringeTable(subValue);
          }
        }
      });
    }

    // To avoid including the global itself in this set, we make a new object
    // that has all the same properties. In SES, we'll freeze the global
    // separately.
    const globals = create(null, getOwnPropertyDescriptors(global));
    addToWhiteTable(globals, whitelist.namedIntrinsics);
    const intrinsics = getAnonIntrinsics(global);
    addToWhiteTable(intrinsics, whitelist.anonIntrinsics);
    // whiteTable is now a map from objects to a 'permit'

    // getPermit() is a non-recursive function taking (obj, propname) and
    // returning a permit

    // addToFringeTable() does a recursive property walk of its first argument,
    // finds everything that getPermit() allows, and puts them all into the Set
    // named 'fringeTable'

    addToFringeTable(globals);
    addToFringeTable(intrinsics);
    return fringeTable;
  }

  // Adapted from SES/Caja - Copyright (C) 2011 Google Inc.

  // this use of 'global' is why Harden is a "resource module", whereas
  // MakeHardener is "pure".
  const initialRoots = buildTable((0, eval)('this')); // eslint-disable-line no-eval
  // console.log('initialRoots are', initialRoots);

  const harden = makeHardener(initialRoots);

  // Copyright (C) 2011 Google Inc.
  // Copyright (C) 2018 Agoric
  //
  // Licensed under the Apache License, Version 2.0 (the "License");
  // you may not use this file except in compliance with the License.
  // You may obtain a copy of the License at
  //
  // http://www.apache.org/licenses/LICENSE-2.0
  //
  // Unless required by applicable law or agreed to in writing, software
  // distributed under the License is distributed on an "AS IS" BASIS,
  // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  // See the License for the specific language governing permissions and
  // limitations under the License.

  /**
   * Is allegedNum a number in the contiguous range of exactly and
   * unambiguously representable natural numbers (non-negative integers)?
   *
   * <p>See <a href=
   * "https://code.google.com/p/google-caja/issues/detail?id=1801"
   * >Issue 1801: Nat must include at most (2**53)-1</a>
   * and <a href=
   * "https://mail.mozilla.org/pipermail/es-discuss/2013-July/031716.html"
   * >Allen Wirfs-Brock's suggested phrasing</a> on es-discuss.
   */

  function Nat(allegedNum) {
    if (!Number.isSafeInteger(allegedNum)) {
      throw new RangeError('not a safe integer');
    }

    if (allegedNum < 0) {
      throw new RangeError('negative');
    }

    return allegedNum;
  }

  // Special property name that indicates an encoding that needs special
  // decoding.
  const QCLASS = '@qclass';

  // objects can only be passed in one of two/three forms:
  // 1: pass-by-presence: all properties (own and inherited) are methods,
  //    the object itself is of type object, not function
  // 2: pass-by-copy: all string-named own properties are data, not methods
  //    the object must inherit from Object.prototype or null
  // 3: the empty object is pass-by-presence, for identity comparison

  // todo: maybe rename pass-by-presence to pass-as-presence, or pass-by-proxy
  // or remote reference

  // all objects must be frozen

  // anything else will throw an error if you try to serialize it

  // with these restrictions, our remote call/copy protocols expose all useful
  // behavior of these objects: pass-by-presence objects have no other data (so
  // there's nothing else to copy), and pass-by-copy objects have no other
  // behavior (so there's nothing else to invoke)

  const errorConstructors = new Map([
    ['Error', Error],
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError],
  ]);

  function getErrorContructor(name) {
    return errorConstructors.get(name);
  }

  function isPassByCopyError(val) {
    // TODO: Need a better test than instanceof
    if (!(val instanceof Error)) {
      return false;
    }
    const proto = Object.getPrototypeOf(val);
    const { name } = val;
    const EC = getErrorContructor(name);
    if (!EC || EC.prototype !== proto) {
      throw TypeError(`Must inherit from an error class .prototype ${val}`);
    }

    const {
      message: { value: messageStr },
      // Allow but ignore only extraneous own `stack` property.
      // TODO: I began the variable below with "_". Why do I still need
      // to suppress the lint complaint?
      // eslint-disable-next-line no-unused-vars
      stack: _optStackDesc,
      ...restDescs
    } = Object.getOwnPropertyDescriptors(val);
    const restNames = Object.keys(restDescs);
    if (restNames.length >= 1) {
      throw new TypeError(`Unexpected own properties in error: ${restNames}`);
    }
    if (typeof messageStr !== 'string') {
      throw new TypeError(`malformed error object: ${val}`);
    }
    return true;
  }

  function isPassByCopyArray(val) {
    if (!Array.isArray(val)) {
      return false;
    }
    if (Object.getPrototypeOf(val) !== Array.prototype) {
      throw new TypeError(`malformed array: ${val}`);
    }
    const len = val.length;
    const descs = Object.getOwnPropertyDescriptors(val);
    for (let i = 0; i < len; i += 1) {
      const desc = descs[i];
      if (!desc) {
        throw new TypeError(`arrays must not contain holes`);
      }
      if (!('value' in desc)) {
        throw new TypeError(`arrays must not contain accessors`);
      }
      if (typeof desc.value === 'function') {
        throw new TypeError(`arrays must not contain methods`);
      }
    }
    if (Object.keys(descs).length !== len + 1) {
      throw new TypeError(`array must not have non-indexes ${val}`);
    }
    return true;
  }

  function isPassByCopyRecord(val) {
    if (Object.getPrototypeOf(val) !== Object.prototype) {
      return false;
    }
    const descList = Object.values(Object.getOwnPropertyDescriptors(val));
    if (descList.length === 0) {
      // empty non-array objects are pass-by-presence, not pass-by-copy
      return false;
    }
    for (const desc of descList) {
      if (!('value' in desc)) {
        // Should we error if we see an accessor here?
        return false;
      }
      if (typeof desc.value === 'function') {
        return false;
      }
    }
    return true;
  }

  function mustPassByPresence(val) {
    // throws exception if cannot
    if (!Object.isFrozen(val)) {
      throw new Error(`cannot serialize non-frozen objects like ${val}`);
    }
    if (typeof val !== 'object') {
      throw new Error(`cannot serialize non-objects like ${val}`);
    }
    if (Array.isArray(val)) {
      throw new Error(`Arrays cannot be pass-by-presence`);
    }
    if (val === null) {
      throw new Error(`null cannot be pass-by-presence`);
    }

    const names = Object.getOwnPropertyNames(val);
    names.forEach(name => {
      if (name === 'e') {
        // hack to allow Vows to pass-by-presence
        // TODO: Make sure .e. is gone. Then get rid of this hack.
        return;
      }
      if (typeof val[name] !== 'function') {
        throw new Error(
          `cannot serialize objects with non-methods like the .${name} in ${val}`,
        );
        // return false;
      }
    });

    const p = Object.getPrototypeOf(val);
    if (p !== null && p !== Object.prototype) {
      mustPassByPresence(p);
    }
    // ok!
  }

  // How would val be passed?  For primitive values, the answer is
  //   * 'null' for null
  //   * throwing an error for an unregistered symbol
  //   * that value's typeof string for all other primitive values
  // For frozen objects, the possible answers
  //   * 'copyRecord' for non-empty records with only data properties
  //   * 'copyArray' for arrays with only data properties
  //   * 'copyError' for instances of Error with only data properties
  //   * 'presence' for non-array objects with only method properties
  //   * 'promise' for genuine promises only
  //   * throwing an error on anything else, including thenables.
  // We export passStyleOf so other algorithms can use this module's
  // classification.
  function passStyleOf(val) {
    const typestr = typeof val;
    switch (typestr) {
      case 'object': {
        if (val === null) {
          return 'null';
        }
        if (QCLASS in val) {
          // TODO Hilbert hotel
          throw new Error(`property "${QCLASS}" reserved`);
        }
        if (!Object.isFrozen(val)) {
          throw new Error(
            `cannot pass non-frozen objects like ${val}. [Use harden()]`,
          );
        }
        if (Promise.resolve(val) === val) {
          return 'promise';
        }
        if (typeof val.then === 'function') {
          throw new Error(`Cannot pass non-promise thenables`);
        }
        if (isPassByCopyError(val)) {
          return 'copyError';
        }
        if (isPassByCopyArray(val)) {
          return 'copyArray';
        }
        if (isPassByCopyRecord(val)) {
          return 'copyRecord';
        }
        mustPassByPresence(val);
        return 'presence';
      }
      case 'function': {
        throw new Error(`bare functions like ${val} are disabled for now`);
      }
      case 'undefined':
      case 'string':
      case 'boolean':
      case 'number':
      case 'bigint': {
        return typestr;
      }
      case 'symbol': {
        if (Symbol.keyFor(val) === undefined) {
          throw new TypeError('Cannot pass unregistered symbols');
        }
        return typestr;
      }
      default: {
        throw new TypeError(`unrecognized typeof ${typestr}`);
      }
    }
  }

  // The ibid logic relies on
  //    * JSON.stringify on an array visiting array indexes from 0 to
  //      arr.length -1 in order, and not visiting anything else.
  //    * JSON.parse of a record (a plain object) creating an object on
  //      which a getOwnPropertyNames will enumerate properties in the
  //      same order in which they appeared in the parsed JSON string.

  function makeReplacerIbidTable() {
    const ibidMap = new Map();
    let ibidCount = 0;

    return harden({
      has(obj) {
        return ibidMap.has(obj);
      },
      get(obj) {
        return ibidMap.get(obj);
      },
      add(obj) {
        ibidMap.set(obj, ibidCount);
        ibidCount += 1;
      },
    });
  }

  function makeReviverIbidTable(cyclePolicy) {
    const ibids = [];
    const unfinishedIbids = new WeakSet();

    return harden({
      get(allegedIndex) {
        const index = Nat(allegedIndex);
        if (index >= ibids.length) {
          throw new RangeError(`ibid out of range: ${index}`);
        }
        const result = ibids[index];
        if (unfinishedIbids.has(result)) {
          switch (cyclePolicy) {
            case 'allowCycles': {
              break;
            }
            case 'warnOfCycles': {
              console.log(`Warning: ibid cycle at ${index}`);
              break;
            }
            case 'forbidCycles': {
              throw new TypeError(`Ibid cycle at ${index}`);
            }
            default: {
              throw new TypeError(`Unrecognized cycle policy: ${cyclePolicy}`);
            }
          }
        }
        return result;
      },
      register(obj) {
        ibids.push(obj);
        return obj;
      },
      start(obj) {
        ibids.push(obj);
        unfinishedIbids.add(obj);
        return obj;
      },
      finish(obj) {
        unfinishedIbids.delete(obj);
        return obj;
      },
    });
  }

  function makeMarshal(serializeSlot, unserializeSlot) {
    function makeReplacer(slots, slotMap) {
      const ibidTable = makeReplacerIbidTable();

      return function replacer(_, val) {
        // First we handle all primitives. Some can be represented directly as
        // JSON, and some must be encoded as [QCLASS] composites.
        const passStyle = passStyleOf(val);
        switch (passStyle) {
          case 'null': {
            return null;
          }
          case 'undefined': {
            return harden({ [QCLASS]: 'undefined' });
          }
          case 'string':
          case 'boolean': {
            return val;
          }
          case 'number': {
            if (Number.isNaN(val)) {
              return harden({ [QCLASS]: 'NaN' });
            }
            if (Object.is(val, -0)) {
              return harden({ [QCLASS]: '-0' });
            }
            if (val === Infinity) {
              return harden({ [QCLASS]: 'Infinity' });
            }
            if (val === -Infinity) {
              return harden({ [QCLASS]: '-Infinity' });
            }
            return val;
          }
          case 'symbol': {
            const key = Symbol.keyFor(val);
            return harden({
              [QCLASS]: 'symbol',
              key,
            });
          }
          case 'bigint': {
            return harden({
              [QCLASS]: 'bigint',
              digits: String(val),
            });
          }
          default: {
            // if we've seen this object before, serialize a backref
            if (ibidTable.has(val)) {
              // Backreference to prior occurrence
              return harden({
                [QCLASS]: 'ibid',
                index: ibidTable.get(val),
              });
            }
            ibidTable.add(val);

            switch (passStyle) {
              case 'copyRecord':
              case 'copyArray': {
                // console.log(`canPassByCopy: ${val}`);
                // Purposely in-band for readability, but creates need for
                // Hilbert hotel.
                return val;
              }
              case 'copyError': {
                // We deliberately do not share the stack, but it would
                // be useful to log the stack locally so someone who has
                // privileged access to the throwing Vat can correlate
                // the problem with the remote Vat that gets this
                // summary. If we do that, we could allocate some random
                // identifier and include it in the message, to help
                // with the correlation.
                return harden({
                  [QCLASS]: 'error',
                  name: `${val.name}`,
                  message: `${val.message}`,
                });
              }
              case 'presence':
              case 'promise': {
                // console.log(`serializeSlot: ${val}`);
                return serializeSlot(val, slots, slotMap);
              }
              default: {
                throw new TypeError(`unrecognized passStyle ${passStyle}`);
              }
            }
          }
        }
      };
    }

    // val might be a primitive, a pass by (shallow) copy object, a
    // remote reference, or other.  We treat all other as a local object
    // to be exported as a local webkey.
    function serialize(val) {
      const slots = [];
      const slotMap = new Map(); // maps val (proxy or presence) to
      // index of slots[]
      return harden({
        body: JSON.stringify(val, makeReplacer(slots, slotMap)),
        slots,
      });
    }

    function makeFullRevive(slots, cyclePolicy) {
      // ibid table is shared across recursive calls to fullRevive.
      const ibidTable = makeReviverIbidTable(cyclePolicy);

      // We stay close to the algorith at
      // https://tc39.github.io/ecma262/#sec-json.parse , where
      // fullRevive(JSON.parse(str)) is like JSON.parse(str, revive))
      // for a similar reviver. But with the following differences:
      //
      // Rather than pass a reviver to JSON.parse, we first call a plain
      // (one argument) JSON.parse to get rawTree, and then post-process
      // the rawTree with fullRevive. The kind of revive function
      // handled by JSON.parse only does one step in post-order, with
      // JSON.parse doing the recursion. By contrast, fullParse does its
      // own recursion, enabling it to interpret ibids in the same
      // pre-order in which the replacer visited them, and enabling it
      // to break cycles.
      //
      // In order to break cycles, the potentially cyclic objects are
      // not frozen during the recursion. Rather, the whole graph is
      // hardened before being returned. Error objects are not
      // potentially recursive, and so may be harmlessly hardened when
      // they are produced.
      //
      // fullRevive can produce properties whose value is undefined,
      // which a JSON.parse on a reviver cannot do. If a reviver returns
      // undefined to JSON.parse, JSON.parse will delete the property
      // instead.
      //
      // fullRevive creates and returns a new graph, rather than
      // modifying the original tree in place.
      //
      // fullRevive may rely on rawTree being the result of a plain call
      // to JSON.parse. However, it *cannot* rely on it having been
      // produced by JSON.stringify on the replacer above, i.e., it
      // cannot rely on it being a valid marshalled
      // representation. Rather, fullRevive must validate that.
      return function fullRevive(rawTree) {
        if (Object(rawTree) !== rawTree) {
          // primitives pass through
          return rawTree;
        }
        if (QCLASS in rawTree) {
          const qclass = rawTree[QCLASS];
          if (typeof qclass !== 'string') {
            throw new TypeError(`invalid qclass typeof ${typeof qclass}`);
          }
          switch (qclass) {
            // Encoding of primitives not handled by JSON
            case 'undefined': {
              return undefined;
            }
            case '-0': {
              return -0;
            }
            case 'NaN': {
              return NaN;
            }
            case 'Infinity': {
              return Infinity;
            }
            case '-Infinity': {
              return -Infinity;
            }
            case 'symbol': {
              if (typeof rawTree.key !== 'string') {
                throw new TypeError(
                  `invalid symbol key typeof ${typeof rawTree.key}`,
                );
              }
              return Symbol.for(rawTree.key);
            }
            case 'bigint': {
              if (typeof rawTree.digits !== 'string') {
                throw new TypeError(
                  `invalid digits typeof ${typeof rawTree.digits}`,
                );
              }
              /* eslint-disable-next-line no-undef */
              return BigInt(rawTree.digits);
            }

            case 'ibid': {
              return ibidTable.get(rawTree.index);
            }

            case 'error': {
              if (typeof rawTree.name !== 'string') {
                throw new TypeError(
                  `invalid error name typeof ${typeof rawTree.name}`,
                );
              }
              if (typeof rawTree.message !== 'string') {
                throw new TypeError(
                  `invalid error message typeof ${typeof rawTree.message}`,
                );
              }
              const EC = getErrorContructor(`${rawTree.name}`) || Error;
              return ibidTable.register(harden(new EC(`${rawTree.message}`)));
            }

            case 'slot': {
              return ibidTable.register(unserializeSlot(rawTree, slots));
            }

            default: {
              // TODO reverse Hilbert hotel
              throw new TypeError(`unrecognized ${QCLASS} ${qclass}`);
            }
          }
        } else if (Array.isArray(rawTree)) {
          const result = ibidTable.start([]);
          const len = rawTree.length;
          for (let i = 0; i < len; i += 1) {
            result[i] = fullRevive(rawTree[i]);
          }
          return ibidTable.finish(result);
        } else {
          const result = ibidTable.start({});
          const names = Object.getOwnPropertyNames(rawTree);
          for (const name of names) {
            result[name] = fullRevive(rawTree[name]);
          }
          return ibidTable.finish(result);
        }
      };
    }

    function unserialize(data, cyclePolicy = 'forbidCycles') {
      if (data.body !== `${data.body}`) {
        throw new Error(
          `unserialize() given non-capdata (.body is ${data.body}, not string)`,
        );
      }
      if (!(data.slots instanceof Array)) {
        throw new Error(`unserialize() given non-capdata (.slots are not Array)`);
      }
      const rawTree = harden(JSON.parse(data.body));
      const fullRevive = makeFullRevive(data.slots, cyclePolicy);
      return harden(fullRevive(rawTree));
    }

    return harden({
      serialize,
      unserialize,
    });
  }

  /* global globalThis window */
  // eslint-disable-next-line spaced-comment
  /// <reference path="index.d.ts" />
  // Shim globalThis when we don't have it.
  if (typeof globalThis === 'undefined') {
    const myGlobal = typeof window === 'undefined' ? global : window;
    myGlobal.globalThis = myGlobal;
  }

  const harden$1 = (globalThis.SES && globalThis.SES.harden) || Object.freeze;

  const readOnlyProxy = {
    set(_target, _prop, _value) {
      return false;
    },
    isExtensible(_target) {
      return false;
    },
    setPrototypeOf(_target, _value) {
      return false;
    },
    deleteProperty(_target, _prop) {
      return false;
    },
  };

  /**
   * A Proxy handler for E(x).
   *
   * @param {*} x Any value passed to E(x)
   * @returns {ProxyHandler} the Proxy handler
   */
  function EProxyHandler(x, HandledPromise) {
    return harden$1({
      ...readOnlyProxy,
      get(_target, p, _receiver) {
        if (`${p}` !== p) {
          return undefined;
        }
        // Harden this Promise because it's our only opportunity to ensure
        // p1=E(x).foo() is hardened. The Handled Promise API does not (yet)
        // allow the handler to synchronously influence the promise returned
        // by the handled methods, so we must freeze it from the outside. See
        // #95 for details.
        return (...args) => harden$1(HandledPromise.applyMethod(x, p, args));
      },
      apply(_target, _thisArg, argArray = []) {
        return harden$1(HandledPromise.applyFunction(x, argArray));
      },
      has(_target, _p) {
        // We just pretend everything exists.
        return true;
      },
    });
  }

  function makeE(HandledPromise) {
    function E(x) {
      const handler = EProxyHandler(x, HandledPromise);
      return harden$1(new Proxy({}, handler));
    }

    const makeEGetterProxy = (x, wrap = o => o) =>
      new Proxy(
        Object.create(null),
        {
          ...readOnlyProxy,
          has(_target, _prop) {
            return true;
          },
          get(_target, prop) {
            return wrap(HandledPromise.get(x, prop));
          },
        },
      );
    

    const makeEDeleterProxy = (x, wrap = o => o) =>
      new Proxy(
        Object.create(null),
        {
          ...readOnlyProxy,
          has(_target, _prop) {
            return true;
          },
          get(_target, prop) {
            return wrap(HandledPromise.delete(x, prop));
          },
        },
      );

    const makeESetterProxy = (x, wrap = o => o) =>
      new Proxy(
        Object.create(null),
        {
          ...readOnlyProxy,
          has(_target, _prop) {
            return true;
          },
          get(_target, prop) {
            return harden$1(value =>
              wrap(HandledPromise.set(x, prop, value)),
            );
          },
        },
      );

    const makeEMethodProxy = (x, wrap = o => o) =>
      new Proxy(
        (..._args) => {},
        {
          ...readOnlyProxy,
          has(_target, _prop) {
            return true;
          },
          get(_target, prop) {
            return harden$1((...args) =>
              wrap(HandledPromise.applyMethod(x, prop, args)),
            );
          },
          apply(_target, _thisArg, args = []) {
            return wrap(HandledPromise.applyFunction(x, args));
          },
        });

    E.G = makeEGetterProxy;
    E.D = makeEDeleterProxy;
    E.S = makeESetterProxy;
    E.M = makeEMethodProxy;

    const EChain = x =>
      harden$1({
        get G() {
          // Return getter.
          return makeEGetterProxy(x, EChain);
        },
        get D() {
          // Return deleter.
          return makeEDeleterProxy(x, EChain);
        },
        get S() {
          // Return setter.
          return makeESetterProxy(x, EChain);
        },
        get M() {
          // Return method-caller.
          return makeEMethodProxy(x, EChain);
        },
        get P() {
          // Return as promise.
          return Promise.resolve(x);
        },
      });

    E.C = EChain;
    return harden$1(E);
  }

  /* global globalThis */

  // 'E' and 'HandledPromise' are exports of the module

  // For now:
  // import { HandledPromise, E } from '@agoric/eventual-send';
  // ...

  // TODO: Maybe rename the global HandledPromise to something only the tildot rewriter uses.
  if (!globalThis.HandledPromise) {
    /* eslint-disable no-use-before-define */
    // Install the shim as best we can.
    maybeExtendPromise(Promise);
    globalThis.HandledPromise = makeHandledPromise(Promise);
    /* eslint-enable no-use-before-define */
  }

  // Provide a handled platform Promise if SES has not run.
  const { HandledPromise } = globalThis;
  const E = makeE(HandledPromise);

  // the following methods (makeHandledPromise and maybeExtendPromise) are part
  // of the shim, and will not be exported by the module once the feature
  // becomes a part of standard javascript

  // Create HandledPromise static methods as a bridge from v0.2.4
  // to new proposal support (wavy dot's infrastructure).
  function makeHandledPromise(EPromise) {
    const harden = (globalThis.SES && globalThis.SES.harden) || Object.freeze;

    // TODO: Use HandledPromise.resolve to store our weakmap, and
    // install it on Promise.resolve.
    const staticMethods = {
      get(target, key) {
        return EPromise.resolve(target).get(key);
      },
      getSendOnly(target, key) {
        EPromise.resolve(target).get(key);
      },
      set(target, key, val) {
        return EPromise.resolve(target).put(key, val);
      },
      setSendOnly(target, key, val) {
        EPromise.resolve(target).put(key, val);
      },
      // TODO: Change HandledPromise.delete to HandledPromise.deleteProperty
      delete(target, key) {
        return EPromise.resolve(target).delete(key);
      },
      deleteSendOnly(target, key) {
        EPromise.resolve(target).delete(key);
      },
      applyFunction(target, args) {
        return EPromise.resolve(target).post(undefined, args);
      },
      applyFunctionSendOnly(target, args) {
        EPromise.resolve(target).post(undefined, args);
      },
      applyMethod(target, key, args) {
        return EPromise.resolve(target).post(key, args);
      },
      applyMethodSendOnly(target, key, args) {
        EPromise.resolve(target).post(key, args);
      },
    };

    return harden(staticMethods);
  }

  /**
   * Modify a Promise class to have it support eventual send
   * (infix-bang) operations.
   *
   * Based heavily on nanoq
   * https://github.com/drses/nanoq/blob/master/src/nanoq.js
   *
   * Original spec for the infix-bang desugaring:
   * https://web.archive.org/web/20161026162206/http://wiki.ecmascript.org/doku.php?id=strawman:concurrency
   *
   * @param {typeof Promise} Promise ES6 Promise class to shim
   * @return {typeof EPromise} Extended promise
   */
  function maybeExtendPromise(Promise) {
    // Make idempotent, so we don't layer on top of a BasePromise that
    // is adequate.
    if (typeof Promise.makeHandled === 'function') {
      return Promise;
    }

    const harden = (globalThis.SES && globalThis.SES.harden) || Object.freeze;

    // xs doesn't support WeakMap in pre-loaded closures
    // aka "vetted customization code"
    let presenceToHandler;
    let presenceToPromise;
    let promiseToHandler;
    function ensureMaps() {
      if (!presenceToHandler) {
        presenceToHandler = new WeakMap();
        presenceToPromise = new WeakMap();
        promiseToHandler = new WeakMap();
      }
    }

    // This special handler accepts Promises, and forwards
    // handled Promises to their corresponding fulfilledHandler.
    let forwardingHandler;
    function handle(p, operation, ...args) {
      ensureMaps();
      const unfulfilledHandler = promiseToHandler.get(p);
      let executor;
      if (
        unfulfilledHandler &&
        typeof unfulfilledHandler[operation] === 'function'
      ) {
        executor = (resolve, reject) => {
          // We run in a future turn to prevent synchronous attacks,
          Promise.resolve()
            .then(() =>
              // and resolve to the answer from the specific unfulfilled handler,
              resolve(unfulfilledHandler[operation](p, ...args)),
            )
            .catch(reject);
        };
      } else {
        executor = (resolve, reject) => {
          // We run in a future turn to prevent synchronous attacks,
          Promise.resolve(p)
            .then(o => {
              // We now have the naked object,
              if (typeof forwardingHandler[operation] !== 'function') {
                throw TypeError(
                  `forwardingHandler.${operation} is not a function`,
                );
              }
              // and resolve to the forwardingHandler's operation.
              resolve(forwardingHandler[operation](o, ...args));
            })
            .catch(reject);
        };
      }

      // We return a handled promise with the default unfulfilled handler.
      // This prevents a race between the above Promise.resolves and
      // pipelining.
      return Promise.makeHandled(executor);
    }

    Object.defineProperties(
      Promise.prototype,
      Object.getOwnPropertyDescriptors({
        get(key) {
          return handle(this, 'GET', key);
        },

        put(key, val) {
          return handle(this, 'PUT', key, val);
        },

        delete(key) {
          return handle(this, 'DELETE', key);
        },

        post(optKey, args) {
          return handle(this, 'POST', optKey, args);
        },

        invoke(optKey, ...args) {
          return handle(this, 'POST', optKey, args);
        },

        fapply(args) {
          return handle(this, 'POST', undefined, args);
        },

        fcall(...args) {
          return handle(this, 'POST', undefined, args);
        },
      }),
    );

    const baseResolve = Promise.resolve.bind(Promise);

    // Add Promise.makeHandled and update Promise.resolve.
    Object.defineProperties(
      Promise,
      Object.getOwnPropertyDescriptors({
        resolve(value) {
          ensureMaps();
          // Resolving a Presence returns the pre-registered handled promise.
          const handledPromise = presenceToPromise.get(value);
          if (handledPromise) {
            return handledPromise;
          }
          return baseResolve(value);
        },

        makeHandled(executor, unfulfilledHandler = undefined) {
          ensureMaps();
          let handledResolve;
          let handledReject;
          let fulfilled = false;
          let continueForwarding = () => {};
          const handledP = new Promise((resolve, reject) => {
            handledResolve = value => {
              fulfilled = true;
              resolve(value);
            };
            handledReject = err => {
              fulfilled = true;
              reject(err);
            };
          });

          if (!unfulfilledHandler) {
            // Create a simple unfulfilledHandler that just postpones until the
            // fulfilledHandler is set.
            //
            // This is insufficient for actual remote handled Promises
            // (too many round-trips), but is an easy way to create a
            // local handled Promise.
            const interlockP = new Promise((resolve, reject) => {
              continueForwarding = (err = null, targetP = undefined) => {
                if (err !== null) {
                  reject(err);
                  return;
                }
                // Box the target promise so that it isn't further resolved.
                resolve([targetP]);
                // Return undefined.
              };
            });

            const makePostponed = postponedOperation => {
              // Just wait until the handler is resolved/rejected.
              return function postpone(x, ...args) {
                // console.log(`forwarding ${postponedOperation} ${args[0]}`);
                return Promise.makeHandled((resolve, reject) => {
                  interlockP
                    .then(([targetP]) => {
                      // If targetP is a handled promise, use it, otherwise x.
                      const nextPromise = targetP || x;
                      resolve(nextPromise[postponedOperation](...args));
                    })
                    .catch(reject);
                });
              };
            };

            unfulfilledHandler = {
              GET: makePostponed('get'),
              PUT: makePostponed('put'),
              DELETE: makePostponed('delete'),
              POST: makePostponed('post'),
            };
          }

          function validateHandler(h) {
            if (Object(h) !== h) {
              throw TypeError(`Handler ${h} cannot be a primitive`);
            }
          }
          validateHandler(unfulfilledHandler);

          // Until the handled promise is resolved, we use the unfulfilledHandler.
          promiseToHandler.set(handledP, unfulfilledHandler);

          function rejectHandled(reason) {
            if (fulfilled) {
              return;
            }
            handledReject(reason);
            continueForwarding(reason);
          }

          let resolvedPresence = null;
          function resolveWithPresence(presenceHandler) {
            if (fulfilled) {
              return resolvedPresence;
            }
            try {
              // Sanity checks.
              validateHandler(presenceHandler);

              // Validate and install our mapped target (i.e. presence).
              resolvedPresence = Object.create(null);

              // Create table entries for the presence mapped to the
              // fulfilledHandler.
              presenceToPromise.set(resolvedPresence, handledP);
              presenceToHandler.set(resolvedPresence, presenceHandler);

              // Remove the mapping, as our presenceHandler should be
              // used instead.
              promiseToHandler.delete(handledP);

              // We committed to this presence, so resolve.
              handledResolve(resolvedPresence);
              continueForwarding();
              return resolvedPresence;
            } catch (e) {
              handledReject(e);
              continueForwarding();
              throw e;
            }
          }

          async function resolveHandled(target, deprecatedPresenceHandler) {
            if (fulfilled) {
              return undefined;
            }
            try {
              if (deprecatedPresenceHandler) {
                throw TypeError(
                  `resolveHandled no longer accepts a handler; use resolveWithPresence`,
                );
              }

              // Resolve with the target when it's ready.
              handledResolve(target);

              const existingUnfulfilledHandler = promiseToHandler.get(target);
              if (existingUnfulfilledHandler) {
                // Reuse the unfulfilled handler.
                promiseToHandler.set(handledP, existingUnfulfilledHandler);
                return continueForwarding(null, target);
              }

              // See if the target is a presence we already know of.
              const presence = await target;
              const existingPresenceHandler = presenceToHandler.get(presence);
              if (existingPresenceHandler) {
                promiseToHandler.set(handledP, existingPresenceHandler);
                return continueForwarding(null, handledP);
              }

              // Remove the mapping, as we don't need a handler.
              promiseToHandler.delete(handledP);
              return continueForwarding();
            } catch (e) {
              handledReject(e);
            }
            return continueForwarding();
          }

          // Invoke the callback to let the user resolve/reject.
          executor(
            (...args) => {
              resolveHandled(...args);
            },
            rejectHandled,
            resolveWithPresence,
          );

          // Return a handled Promise, which wil be resolved/rejected
          // by the executor.
          return harden(handledP);
        },
      }),
    );

    function makeForwarder(operation, localImpl) {
      return (o, ...args) => {
        // We are in another turn already, and have the naked object.
        const fulfilledHandler = presenceToHandler.get(o);
        if (
          fulfilledHandler &&
          typeof fulfilledHandler[operation] === 'function'
        ) {
          // The handler was resolved, so use it.
          return fulfilledHandler[operation](o, ...args);
        }

        // Not handled, so use the local implementation.
        return localImpl(o, ...args);
      };
    }

    forwardingHandler = {
      GET: makeForwarder('GET', (o, key) => o[key]),
      PUT: makeForwarder('PUT', (o, key, val) => (o[key] = val)),
      DELETE: makeForwarder('DELETE', (o, key) => delete o[key]),
      POST: makeForwarder('POST', (o, optKey, args) => {
        if (optKey === undefined || optKey === null) {
          return o(...args);
        }
        // console.log(`sending`, optKey, o[optKey], o);
        if (typeof o[optKey] !== 'function') {
          throw TypeError(`o[${JSON.stringify(optKey)}] is not a function`);
        }
        return o[optKey](...args);
      }),
    };
    return Promise;
  }

  // This logic was mostly lifted from @agoric/swingset-vat liveSlots.js

  function makeCapTP(ourId, send, bootstrapObj = undefined) {
    const { serialize, unserialize } = makeMarshal(
      // eslint-disable-next-line no-use-before-define
      serializeSlot,
      // eslint-disable-next-line no-use-before-define
      unserializeSlot,
    );

    let lastPromiseID = 0;
    let lastExportID = 0;
    let lastQuestionID = 0;

    const valToSlot = new WeakMap();
    const slotToVal = new Map(); // exports, answers
    const questions = new Map(); // chosen by us
    const imports = new Map(); // chosen by our peer

    function serializeSlot(val, slots, slotMap) {
      if (!slotMap.has(val)) {
        let slot;
        if (!valToSlot.has(val)) {
          // new export
          if (Promise.resolve(val) === val) {
            lastPromiseID += 1;
            const promiseID = lastPromiseID;
            slot = `p${promiseID}`;
            val.then(
              res =>
                send({
                  type: 'CTP_RESOLVE',
                  promiseID,
                  res: serialize(harden(res)),
                }),
              rej =>
                send({
                  type: 'CTP_RESOLVE',
                  promiseID,
                  rej: serialize(harden(rej)),
                }),
            );
          } else {
            lastExportID += 1;
            const exportID = lastExportID;
            slot = `o${exportID}`;
          }
          valToSlot.set(val, slot);
          slotToVal.set(slot, val);
        }

        slot = valToSlot.get(val);
        const slotIndex = slots.length;
        slots.push(slot);
        slotMap.set(val, slotIndex);
      }

      const slotIndex = slotMap.get(val);
      return harden({
        [QCLASS]: 'slot',
        index: slotIndex,
      });
    }

    function makeRemote(slot) {
      const handler = {
        POST(_o, prop, args) {
          // Support: o~.[prop](...args) remote method invocation
          // FIXME: Implement a HandledPromise here to support pipelining.
          const pr = {};
          pr.p = new Promise((resolve, reject) => {
            pr.res = resolve;
            pr.rej = reject;
          });
          lastQuestionID += 1;
          const questionID = lastQuestionID;
          questions.set(questionID, pr);
          send({
            type: 'CTP_CALL',
            questionID,
            target: slot,
            method: serialize(harden([prop, args])),
          });
          return harden(pr.p);
        },
      };

      const pr = {};
      pr.p = Promise.makeHandled((res, rej, resolveWithPresence) => {
        pr.rej = rej;
        pr.resPres = () => resolveWithPresence(handler);
        pr.res = res;
      }, handler);
      return harden(pr);
    }

    function unserializeSlot(data, slots) {
      const slot = slots[Nat(data.index)];
      let val;
      if (!slotToVal.has(slot)) {
        // Make a new handled promise for the slot.
        const pr = makeRemote(slot);
        if (slot[0] === 'o') {
          // A new presence
          const presence = pr.resPres();
          presence.toString = () => `[Presence ${ourId} ${slot}]`;
          harden(presence);
          val = presence;
        } else {
          // A new promise
          imports.set(Number(slot.slice(1)), pr);
          val = pr.p;
        }
        slotToVal.set(slot, val);
        valToSlot.set(val, slot);
      }
      return slotToVal.get(slot);
    }

    const handler = {
      CTP_BOOTSTRAP(obj) {
        const { questionID } = obj;
        const bootstrap =
          typeof bootstrapObj === 'function' ? bootstrapObj() : bootstrapObj;
        // console.log('sending bootstrap', bootstrap);
        send({
          type: 'CTP_RETURN',
          answerID: questionID,
          result: serialize(bootstrap),
        });
      },
      CTP_CALL(obj) {
        const { questionID, target } = obj;
        const [prop, args] = unserialize(obj.method);
        const val = unserialize({
          body: JSON.stringify({
            [QCLASS]: 'slot',
            index: 0,
          }),
          slots: [target],
        });
        HandledPromise.applyMethod(val, prop, args)
          .then(res =>
            send({
              type: 'CTP_RETURN',
              answerID: questionID,
              result: serialize(harden(res)),
            }),
          )
          .catch(rej =>
            send({
              type: 'CTP_RETURN',
              answerID: questionID,
              exception: serialize(harden(rej)),
            }),
          );
      },
      CTP_RETURN(obj) {
        const { result, exception, answerID } = obj;
        const pr = questions.get(answerID);
        if ('exception' in obj) {
          pr.rej(unserialize(exception));
        } else {
          pr.res(unserialize(result));
        }
        questions.delete(answerID);
      },
      CTP_RESOLVE(obj) {
        const { promiseID, res, rej } = obj;
        const pr = imports.get(promiseID);
        if ('rej' in obj) {
          pr.rej(unserialize(rej));
        } else {
          pr.res(unserialize(res));
        }
        imports.delete(promiseID);
      },
    };

    // Get a reference to the other side's bootstrap object.
    const getBootstrap = () => {
      const pr = {};
      pr.p = new Promise((resolve, reject) => {
        pr.res = resolve;
        pr.rej = reject;
      });
      lastQuestionID += 1;
      const questionID = lastQuestionID;
      questions.set(questionID, pr);
      send({
        type: 'CTP_BOOTSTRAP',
        questionID,
      });
      return harden(pr.p);
    };
    harden(handler);

    // Return a dispatch function.
    const dispatch = obj => {
      const fn = handler[obj.type];
      if (fn) {
        fn(obj);
        return true;
      }
      return false;
    };

    return harden({ dispatch, getBootstrap });
  }

  exports.E = E;
  exports.HandledPromise = HandledPromise;
  exports.Nat = Nat;
  exports.harden = harden;
  exports.makeCapTP = makeCapTP;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
