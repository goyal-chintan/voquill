import 'package:app/model/local_transcription_model.dart';
import 'package:app/utils/channel_utils.dart';
import 'package:app/utils/channel_utils.dart' as channel_utils;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSharedChannel {
  final MethodChannel _channel = const MethodChannel(
    'com.voquill.mobile/shared',
  );
  final List<MethodCall> _calls = <MethodCall>[];

  dynamic Function(String method, dynamic args)? onInvoke;

  void install() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
          _calls.add(call);
          return onInvoke?.call(call.method, call.arguments);
        });
  }

  void reset() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, null);
    _calls.clear();
    onInvoke = null;
  }

  List<String> get methods => _calls.map((call) => call.method).toList();

  Object? argumentsFor(String method) {
    return _calls.lastWhere((call) => call.method == method).arguments;
  }
}

final fakeSharedChannel = _FakeSharedChannel();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.voquill.mobile/shared');

  setUp(() {
    overrideCanSyncForTest(true);
    fakeSharedChannel.install();
  });

  tearDown(() {
    overrideCanSyncForTest(null);
    channel_utils.debugSetCanSyncOverride(null);
    fakeSharedChannel.reset();
  });

  test('syncKeyboardLayouts sends layouts and active language', () async {
    final layouts = <String, dynamic>{
      'en': <String, dynamic>{'languageCode': 'en'},
    };

    await syncKeyboardLayouts(layouts: layouts, activeLanguage: 'en');

    expect(fakeSharedChannel.methods, contains('setKeyboardLayouts'));
    expect(
      fakeSharedChannel.argumentsFor('setKeyboardLayouts'),
      <String, dynamic>{'layouts': layouts, 'activeLanguage': 'en'},
    );
  });

  test('syncKeyboardToolbar sends active mode and visible actions', () async {
    await syncKeyboardToolbar(
      activeMode: 'dictation',
      visibleActions: <String>['startStop', 'language', 'mode'],
    );

    expect(fakeSharedChannel.methods, contains('setKeyboardToolbar'));
    expect(
      fakeSharedChannel.argumentsFor('setKeyboardToolbar'),
      <String, dynamic>{
        'activeMode': 'dictation',
        'visibleActions': <String>['startStop', 'language', 'mode'],
      },
    );
  });

  test('keyboard toolbar payload includes visible actions and active mode', () async {
    final calls = <String, dynamic>{};
    fakeSharedChannel.onInvoke = (method, args) {
      if (method == 'setKeyboardToolbar') {
        (args as Map).forEach((k, v) => calls[k as String] = v);
      }
      return null;
    };
    await syncKeyboardToolbar(
      activeMode: 'Auto',
      visibleActions: ['startStop', 'language', 'mode'],
    );
    expect(calls['activeMode'], 'Auto');
    expect(calls['visibleActions'], containsAll(['startStop', 'language', 'mode']));
  });

  test('syncKeyboardLanguages sends languages and active language', () async {
    await syncKeyboardLanguages(
      languages: <String>['en', 'fr'],
      activeLanguage: 'fr',
    );

    expect(fakeSharedChannel.methods, contains('setKeyboardLanguages'));
    expect(
      fakeSharedChannel.argumentsFor('setKeyboardLanguages'),
      <String, dynamic>{
        'languages': <String>['en', 'fr'],
        'activeLanguage': 'fr',
        'languageMetadata': <String, dynamic>{
          'en': <String, dynamic>{'displayName': 'English'},
          'fr': <String, dynamic>{'displayName': 'Français'},
        },
      },
    );
  });

  test('syncKeyboardAiConfig includes local mode payload', () async {
    channel_utils.debugSetCanSyncOverride(true);
    fakeSharedChannel.reset();
    fakeSharedChannel.install();

    await syncKeyboardAiConfig(
      transcriptionMode: 'local',
      postProcessingMode: 'cloud',
      transcriptionModel: 'tiny',
    );

    expect(fakeSharedChannel.methods, contains('setKeyboardAiConfig'));
    final args = fakeSharedChannel.argumentsFor('setKeyboardAiConfig') as Map;
    expect(args['transcriptionMode'], 'local');
    expect(args['transcriptionModel'], 'tiny');
  });

  test('syncKeyboardAiConfig sends explicit clear for local mode without model', () async {
    channel_utils.debugSetCanSyncOverride(true);
    fakeSharedChannel.reset();
    fakeSharedChannel.install();

    await syncKeyboardAiConfig(
      transcriptionMode: 'local',
      postProcessingMode: 'cloud',
      clearTranscriptionModel: true,
    );

    expect(fakeSharedChannel.methods, contains('setKeyboardAiConfig'));
    final args = fakeSharedChannel.argumentsFor('setKeyboardAiConfig') as Map;
    expect(args['transcriptionMode'], 'local');
    expect(args.containsKey('transcriptionModel'), isFalse);
    expect(args['clearTranscriptionModel'], 'true');
  });

  test('local transcription model bridge uses expected channel methods', () async {
    channel_utils.debugSetCanSyncOverride(true);
    fakeSharedChannel.reset();
    fakeSharedChannel.onInvoke = (method, args) {
      if (method == 'listLocalTranscriptionModels') {
        return [
          {
            'slug': 'tiny',
            'label': 'Whisper Tiny (77 MB)',
            'helper': 'Fastest, lowest accuracy',
            'sizeBytes': 77000000,
            'languageSupport': 'multilingual',
            'downloaded': true,
            'valid': true,
            'selected': true,
          },
        ];
      }
      return null;
    };
    fakeSharedChannel.install();

    final models = await listLocalTranscriptionModels();
    await downloadLocalTranscriptionModel('tiny');
    await deleteLocalTranscriptionModel('tiny');
    await selectLocalTranscriptionModel('tiny');

    expect(
      models,
      const [
        LocalTranscriptionModel(
          slug: 'tiny',
          label: 'Whisper Tiny (77 MB)',
          helper: 'Fastest, lowest accuracy',
          sizeBytes: 77000000,
          languageSupport: LocalTranscriptionLanguageSupport.multilingual,
          downloaded: true,
          valid: true,
          selected: true,
        ),
      ],
    );
    expect(
      fakeSharedChannel.methods,
      [
        'listLocalTranscriptionModels',
        'downloadLocalTranscriptionModel',
        'deleteLocalTranscriptionModel',
        'selectLocalTranscriptionModel',
      ],
    );
    expect((fakeSharedChannel.argumentsFor('downloadLocalTranscriptionModel') as Map)['slug'], 'tiny');
    expect((fakeSharedChannel.argumentsFor('deleteLocalTranscriptionModel') as Map)['slug'], 'tiny');
    expect((fakeSharedChannel.argumentsFor('selectLocalTranscriptionModel') as Map)['slug'], 'tiny');
  });
}
